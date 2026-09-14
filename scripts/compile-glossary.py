"""Use the reference site's exact groups, excluding character/franchise content."""
import csv, hashlib, json, pathlib, re, sys
source, csv_path = map(pathlib.Path, sys.argv[1:3])
root = pathlib.Path(__file__).resolve().parents[1]
reference = json.loads(source.read_text(encoding='utf-8'))
catalog = {r[0]: (int(r[1]), int(r[2])) for r in csv.reader(csv_path.open(encoding='utf-8-sig', newline=''))}
def leaves(value):
    if isinstance(value, str): yield value
    elif isinstance(value, list):
        for child in value: yield from leaves(child)
    elif isinstance(value, dict):
        for child in value.values(): yield from leaves(child)
exclude = re.compile(r'characters?|pok.mon|digimon|vocaloid|vocal synth|deemo|zaku|elite four|gym leaders|mascots', re.I)
blocked = {tag for tag, info in catalog.items() if info[0] in (3, 4)}
def related(value):
    normalized = value.lower().replace(' ', '_')
    qualifiers = re.findall(r'\(([^()]*)\)', normalized)
    return normalized in blocked or any(q in blocked for q in qualifiers) or any(normalized.endswith(suffix) and normalized[:-len(suffix)] in blocked for suffix in ['_(cosplay)', '_(costume)', '_(style)', '_cosplay', '_costume', '_uniform', '_outfit', '_school_uniform'])
excluded_groups = [name for name in reference if exclude.search(name)]
franchise_tags = {tag for group in excluded_groups for tag in leaves(reference[group]) if catalog.get(tag, (3,))[0] in (3, 4)}
excluded_count = 0
themes = []
for name, value in reference.items():
    if name in excluded_groups: continue
    sections = []
    def walk(value, trail):
        global excluded_count
        if any(exclude.search(part) or related(part) for part in trail): return
        if isinstance(value, dict):
            for key, child in value.items():
                if key.lower().replace('_', ' ') == 'tag groups': continue
                walk(child, trail + ([] if key.lower() == 'list_tags' else [key]))
        elif isinstance(value, list):
            tags = []
            for tag in value:
                if not isinstance(tag, str):
                    walk(tag, trail); continue
                tag = tag.strip().lower().replace(' ', '_')
                info = catalog.get(tag)
                if not info or info[0] in (3, 4) or tag in franchise_tags or related(tag):
                    excluded_count += 1; continue
                if tag not in tags: tags.append(tag)
            if tags: sections.append(dict(name=' / '.join(trail), tags=tags))
        elif isinstance(value, str): walk([value], trail)
    walk(value, [])
    if sections: themes.append(dict(id=name, name=name, sections=sections))
themes.sort(key=lambda t: t['name'].lower())
out = dict(source='https://making-images-great-again-library.vercel.app/', dataset='https://github.com/A13JM/MakingImagesGreatAgain_Library', sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), excludedGroups=excluded_groups, excludedOrUnknownOccurrences=excluded_count, themes=themes)
(root / 'src/data/glossary.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(json.dumps(dict(themes=len(themes), subgroups=sum(len(t['sections']) for t in themes), uniqueTags=len({tag for t in themes for s in t['sections'] for tag in s['tags']}), excludedGroups=len(excluded_groups), excludedOrUnknownOccurrences=excluded_count)))
