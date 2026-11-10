import os
import xml.etree.ElementTree as ET

XML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw_guidelines", "SSC_2021_PMC8486643.xml"))
tree = ET.parse(XML_PATH)
root = tree.getroot()

with open("scripts/extracted_sections.txt", "w", encoding="utf-8") as out:
    for i, sec in enumerate(root.findall(".//sec")):
        title = sec.find("title")
        t_text = "".join(title.itertext()).strip() if title is not None else "No Title"
        paragraphs = ["".join(p.itertext()).strip() for p in sec.findall("p")]
        out.write(f"\n--- Section {i+1}: {t_text} ---\n")
        for p in paragraphs:
            out.write(f"  {p}\n")

print(f"Extracted all sections to scripts/extracted_sections.txt. File size: {os.path.getsize('scripts/extracted_sections.txt'):,} bytes.")
