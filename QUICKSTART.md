# Five-minute quick start

The saved-investigation and custom-transect workflows below require the current source build. Existing 0.1.0 archives have not been regenerated; see README for source build commands.

1. Extract the archive. Open the macOS app or Windows executable. The default browser opens the observatory.
2. Choose **Past 24 hours**. Select a **Current area of activity**. Notice the visible region boundary and filtered count.
3. Tap a globe marker. Read magnitude, depth and source time. Try the 2D map and event list; selection is shared.
4. Clear the region. Turn **Auto-rotate** on, then select an event. Rotation pauses; **Resume rotation** restarts it deliberately.
5. Choose **Learn → How can an earthquake be deep inside Earth?**. Select section events and compare source depth with epicentre markers. Return to your exploration.
6. Choose **Offline historical demo**. Restart replay, play, pause and seek backward. The timeline, list, globe and exports use the same cumulative cursor.
7. Export a GeoJSON snapshot, then reopen it. It remains usable without internet access.
8. To demonstrate recovery, disconnect internet and refresh a previously loaded recent period. The last good dataset remains with a stale notice. Reconnect and retry. Do not interrupt someone else's connectivity merely to demonstrate this.

## Save an investigation

1. Under **Saved investigations**, enter a name and notes and choose **Pin current snapshot**.
2. Change filters or load another dataset. Select your investigation and choose **Reopen pinned snapshot** to restore its observations and view offline.
3. Choose **Run saved query**, then **Compare revisions** to inspect changes against the pinned copy. Use **Save name & notes** for annotations and **Pin current snapshot** for a new copy of the observations.
4. Expand **Local cache** to inspect storage or clear cached datasets. Pinned investigations remain saved. Deleting an investigation requires confirmation.

## Inspect a depth section

Choose **Show depth section** below the charts. Set start/end longitude and latitude and total corridor width, then **Apply transect**. Endpoints must be distinct and not antipodal; width is 1-2,000 km. **Tonga preset** restores the original section. Pinned investigations and view links retain these settings.

For a selected earthquake, expand **Source uncertainty & quality**. Missing estimates do not mean zero uncertainty. **Load current source details** requires internet and can return observations newer than your snapshot.

Data lives in the operating system's user configuration directory under `EarthquakeObservatory`. No Go, Node, Python or database installation is needed for the packaged application.

Windows: keep the console window open while using the app; Ctrl+C stops it. macOS: choose **Stop the local server** at the foot of the page when finished.


Built by Bruce Hoppe · [github.com/bruce-hoppe_uoft/earthquake-observatory](https://github.com/bruce-hoppe_uoft/earthquake-observatory)
