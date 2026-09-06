# Five-minute quick start

The refreshed 0.1.0 ZIPs include the country-name and custom-transect controls below. See README for source build commands.

1. Extract the archive. Open the macOS app or Windows executable. The default browser opens the observatory.
2. Choose **Past 24 hours**. Select a **Current area of activity**. Notice the visible region boundary and filtered count.
3. Tap a globe marker. Read magnitude, depth and source time. Try the 2D map and event list; selection is shared.
4. Clear the region. Turn **Auto-rotate** on, then select an event. Rotation pauses; **Resume rotation** restarts it deliberately.
5. Choose **Learn → How can an earthquake be deep inside Earth?**. Select section events and compare source depth with epicentre markers. Return to your exploration.
6. Choose **Offline historical demo**. Restart replay, play, pause and seek backward. The timeline, list, globe and exports use the same cumulative cursor.
7. Export a GeoJSON snapshot, then reopen it. It remains usable without internet access.
8. To demonstrate recovery, disconnect internet and refresh a previously loaded recent period. The last good dataset remains with a stale notice. Reconnect and retry. Do not interrupt someone else's connectivity merely to demonstrate this.

## Keep a snapshot and show country names

Export a GeoJSON snapshot and use **Reopen snapshot** to load it later. **Copy view link** retains query and view settings. Toggle **Country names** beneath the map; it works independently of plate boundaries on the globe and flat map.

## Inspect a depth section

Choose **Show depth section** below the charts. Set start/end longitude and latitude and total corridor width, then **Apply transect**. Endpoints must be distinct and not antipodal; width is 1-2,000 km. **Tonga preset** restores the original section. View links retain these settings.

For a selected earthquake, expand **Source uncertainty & quality**. Missing estimates do not mean zero uncertainty. **Load current source details** requires internet and can return observations newer than your snapshot.

Data lives in the operating system's user configuration directory under `EarthquakeObservatory`. No Go, Node, Python or database installation is needed for the packaged application.

Windows: keep the console window open while using the app; Ctrl+C stops it. macOS: choose **Stop the local server** at the foot of the page when finished.


Built by Bruce Hoppe · [github.com/bruce-hoppe_uoft/earthquake-observatory](https://github.com/bruce-hoppe_uoft/earthquake-observatory)
