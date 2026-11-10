import os
import xml.etree.ElementTree as ET
import re

XML_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw_guidelines", "SSC_2021_PMC8486643.xml"))

def inspect():
    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    
    # In PMC XML, recommendations are often in <boxed-text>, <p>, or <sec>
    recs = []
    
    # Search for recommendation statements
    for p in root.findall(".//p"):
        txt = "".join(p.itertext()).strip()
        # SSC recommendation patterns: "1. For ...", "Recommendation X", "We recommend", "We suggest"
        if re.search(r'^(For patients|In patients|We recommend|We suggest|For adults)\b', txt, re.IGNORECASE):
            if len(txt) > 40 and len(txt) < 800:
                recs.append(txt)
                
    print(f"Found {len(recs)} potential recommendation statements in SSC 2021 XML.")
    print("Sample recommendations extracted:")
    for i, r in enumerate(recs[:10]):
        print(f"\n[{i+1}] {r}")

if __name__ == "__main__":
    inspect()
