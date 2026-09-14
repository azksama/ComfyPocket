"""Build a deterministic, compressed offline index. Original CSV is never modified."""
import csv, gzip, hashlib, json, pathlib, sys

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(__file__).resolve().parents[1] / 'src' / 'data'
destination.mkdir(exist_ok=True)
tags = {}
with source.open(encoding='utf-8-sig', newline='') as handle:
    for row in csv.reader(handle):
        if len(row) != 4 or not row[0]:
            raise ValueError('Invalid tag record')
        category, count = int(row[1]), int(row[2])
        if category not in (0, 1, 3, 4, 5) or count < 0:
            raise ValueError('Invalid category or count')
        if row[0] not in tags or count > tags[row[0]][2]: tags[row[0]] = [row[0], category, count]
        # This supplied export has no aliases; refuse to silently discard new ones.
        if row[3]:
            raise ValueError('Alias-bearing exports require an alias index')
rows = sorted(tags.values(), key=lambda r: r[0].encode('utf-16-be'))
data = '\n'.join(json.dumps(row[0], ensure_ascii=False) + '\t' + str(row[1]) + '\t' + str(row[2]) for row in rows).encode('utf-8')
packed = gzip.compress(data, compresslevel=9, mtime=0)
(destination / 'booru.tsv.gz').write_bytes(packed)
manifest = dict(format='sorted-json-name-tsv-gzip-v1', count=len(rows), sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), bytes=len(packed))
(destination / 'booru.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
print(json.dumps(manifest))
