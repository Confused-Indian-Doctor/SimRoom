"""Lossless text extraction for faculty review; never guesses clinical mappings.

Usage: python scripts/extract-faculty-packs.py PACK.docx [PACK.docx ...]
Private outputs go to functions/content/faculty-packs/. Values and doses are not normalised.
"""
from pathlib import Path
import hashlib, json, sys, zipfile
import xml.etree.ElementTree as ET
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'

def paragraph(node):
    parts=[]
    for item in node.iter():
        if item.tag == W+'t': parts.append(item.text or '')
        elif item.tag == W+'tab': parts.append('\t')
        elif item.tag in [W+'br',W+'cr']: parts.append('\n')
    return ''.join(parts)

def extract(path):
    with zipfile.ZipFile(path) as archive:
        root=ET.fromstring(archive.read('word/document.xml'))
        blocks=[]
        for item in root.find(W+'body'):
            if item.tag == W+'p': blocks.append({'kind':'paragraph','text':paragraph(item)})
            elif item.tag == W+'tbl':
                rows=[[ '\n'.join(paragraph(p) for p in cell.iter(W+'p')) for cell in row.findall(W+'tc')] for row in item.findall(W+'tr')]
                blocks.append({'kind':'table','rows':rows,'text':'\n'.join('\t'.join(row) for row in rows)})
        for name in archive.namelist():
            if name.startswith(('word/footnotes','word/endnotes')) and name.endswith('.xml'):
                node=ET.fromstring(archive.read(name));blocks.append({'kind':'notes','text':'\n'.join(paragraph(p) for p in node.iter(W+'p'))})
        return {'sourceFile':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'blocks':blocks,'originalText':'\n'.join(b['text'] for b in blocks),'reviewStatus':'Awaiting faculty mapping and document comparison'}

if __name__ == '__main__':
    if len(sys.argv)<2: raise SystemExit('Supply the authoritative faculty pack DOCX paths.')
    directory=Path('functions/content/faculty-packs');directory.mkdir(parents=True,exist_ok=True)
    for arg in sys.argv[1:]:
        path=Path(arg)
        if path.suffix.lower()!='.docx': raise SystemExit('This extractor supports DOCX. Other formats need reviewed extraction.')
        output=directory/(path.stem+'.extracted.json');output.write_text(json.dumps(extract(path),ensure_ascii=False,indent=2),encoding='utf-8');print(output)
