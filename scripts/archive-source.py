"""Create a source archive without dependencies, profiles, credentials or build output."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parent.parent
version = json.loads((root / "package.json").read_text(encoding="utf-8"))["version"]
output = root / "dist" / f"GitThor-{version}-source.zip"
output.parent.mkdir(exist_ok=True)
entries = [".github", ".gitignore", ".gitattributes", "package.json", "package-lock.json", "LICENSE",
           "README.md", "CONTRIBUTING.md", "VALIDATION.md", "electron", "src", "assets", "tests", "scripts", "ci"]
with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
    for entry in entries:
        target = root / entry
        files = target.rglob("*") if target.is_dir() else [target]
        for file in files:
            if file.is_file() and "__pycache__" not in file.parts:
                archive.write(file, f"GitThor-{version}/" + file.relative_to(root).as_posix())
print(output)
with ZipFile(output) as archive:
    assert archive.testzip() is None
    print(f"Source archive verified: {len(archive.namelist())} files")
