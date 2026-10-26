"""Package an already built Windows application as a portable ZIP."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
app = root / "dist" / "win-unpacked"
assert (app / "GitThor.exe").is_file(), "Build the Windows application first."
output = root / "dist" / f"GitThor-{version}-windows-x64.zip"
with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=3) as archive:
    for file in app.rglob("*"):
        if file.is_file():
            archive.write(file, "GitThor/" + file.relative_to(app).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
    print(f"Windows archive verified: {len(archive.namelist())} files")
print(output)
