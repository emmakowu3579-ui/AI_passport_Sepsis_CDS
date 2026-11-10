import xml.etree.ElementTree as ET
import os

guidelines_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "raw_guidelines"))

for fname in os.listdir(guidelines_dir):
    if fname.endswith(".xml"):
        p = os.path.join(guidelines_dir, fname)
        try:
            tree = ET.parse(p)
            root = tree.getroot()
            title = root.find(".//article-title")
            title_text = "".join(title.itertext()).strip() if title is not None else "No title"
            sections = root.findall(".//sec")
            tables = root.findall(".//table-wrap")
            print(f"\n==========================================")
            print(f"File: {fname}")
            print(f"Title: {title_text}")
            print(f"Total Sections: {len(sections)}, Tables: {len(tables)}")
            
            # Print first 10 section titles
            print("Key Section Titles:")
            count = 0
            for sec in sections:
                stitle = sec.find("title")
                if stitle is not None and stitle.text:
                    stext = "".join(stitle.itertext()).strip()
                    if stext:
                        print(f"  - {stext}")
                        count += 1
                        if count >= 12:
                            break
        except Exception as e:
            print(f"Error parsing {fname}: {e}")
