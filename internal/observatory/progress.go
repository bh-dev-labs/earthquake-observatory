package observatory

import (
	"context"
	"fmt"
	"time"
)

type Progress struct {
	ID         string `json:"id"`
	State      string `json:"state"`
	Requests   int    `json:"requests"`
	Partitions int    `json:"partitions"`
	Events     int    `json:"events"`
	Error      string `json:"error,omitempty"`
}
type historyJob struct {
	progress Progress
	cancel   context.CancelFunc
	started  time.Time
}
type progressKey struct{}

func (s *Service) updateProgress(ctx context.Context, update func(*Progress)) {
	id, ok := ctx.Value(progressKey{}).(string)
	if !ok {
		return
	}
	s.jobsMu.Lock()
	defer s.jobsMu.Unlock()
	if job := s.jobs[id]; job != nil {
		update(&job.progress)
	}
}

func (s *Service) HistoryTracked(ctx context.Context, start, end time.Time, min float64, id string) (Dataset, error) {
	if !ValidID(id) {
		return Dataset{}, fmt.Errorf("invalid history job ID")
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	s.jobsMu.Lock()
	if s.jobs == nil {
		s.jobs = make(map[string]*historyJob)
	}
	if _, exists := s.jobs[id]; exists {
		s.jobsMu.Unlock()
		return Dataset{}, fmt.Errorf("history job ID already exists")
	}
	if len(s.jobs) >= 32 {
		oldest := ""
		for key, job := range s.jobs {
			if job.progress.State != "running" && (oldest == "" || job.started.Before(s.jobs[oldest].started)) {
				oldest = key
			}
		}
		if oldest == "" {
			s.jobsMu.Unlock()
			return Dataset{}, fmt.Errorf("history job capacity reached")
		}
		delete(s.jobs, oldest)
	}
	s.jobs[id] = &historyJob{Progress{ID: id, State: "running"}, cancel, time.Now()}
	s.jobsMu.Unlock()
	ctx = context.WithValue(ctx, progressKey{}, id)
	dataset, err := s.History(ctx, start, end, min)
	s.updateProgress(ctx, func(progress *Progress) {
		progress.State = "complete"
		if err != nil {
			progress.State = "failed"
			if ctx.Err() != nil {
				progress.State = "cancelled"
			}
			progress.Error = err.Error()
		}
	})
	return dataset, err
}

func (s *Service) HistoryProgress(id string) (Progress, bool) {
	s.jobsMu.Lock()
	defer s.jobsMu.Unlock()
	job := s.jobs[id]
	if job == nil {
		return Progress{}, false
	}
	return job.progress, true
}

func (s *Service) CancelHistory(id string) bool {
	s.jobsMu.Lock()
	defer s.jobsMu.Unlock()
	job := s.jobs[id]
	if job == nil {
		return false
	}
	job.cancel()
	return true
}

func (s *Service) ClearResponseCache() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.responses = make(map[string]responseCache)
}
