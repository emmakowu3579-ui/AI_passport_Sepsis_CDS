import os
import xml.etree.ElementTree as ET

XML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw_guidelines", "SSC_2021_PMC8486643.xml"))

tree = ET.parse(XML_PATH)
root = tree.getroot()

tags = {}
for elem in root.iter():
    tags[elem.tag] = tags.get(elem.tag, 0) + 1

print("Tag frequencies in SSC 2021 XML:")
for t, c in sorted(tags.items(), key=lambda x: -x[1])[:25]:
    print(f"  {t}: {c}")

# Let's inspect some sections and titles
for sec in root.findall(".//sec")[:15]:
    title = sec.find("title")
    t_text = "".join(title.itertext()).strip() if title is not None else ""
    first_p = sec.find(".//p")
    p_text = "".join(first_p.itertext()).strip()[:100] if first_p is not None else ""
    print(f"\nSection: {t_text}")
    print(f"  P: {p_text}...")
