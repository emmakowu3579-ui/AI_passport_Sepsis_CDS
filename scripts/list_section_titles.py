with open("scripts/extracted_sections.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

for l in lines:
    if l.startswith("--- Section "):
        print(l.strip())
