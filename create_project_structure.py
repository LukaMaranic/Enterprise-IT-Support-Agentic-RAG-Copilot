from pathlib import Path

root = Path(".")

folders = [
    "app/api",
    "app/core",
    "app/rag",
    "app/services",
    "data",
    "templates",
    "static",
    "uploads",
    "tests",
]

files = [
    "app/main.py",
    #"requiemrents.txt",
    "ingest_sample_kb.py",
    "run.py",
    ".env",
]

for folder in folders:
    (root / folder).mkdir(parents=True, exist_ok=True)

for file in files:
    (root / file).touch(exist_ok=True)

print("Projext structure has been created successfully.")