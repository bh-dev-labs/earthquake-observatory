"""Archive a release tree, retaining executable mode bits."""
import pathlib,sys,zipfile
folder=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(str(folder)+'.zip','w',zipfile.ZIP_DEFLATED) as z:
    for path in sorted(folder.rglob('*')):
        if path.is_file(): z.write(path,path.relative_to(folder.parent))
