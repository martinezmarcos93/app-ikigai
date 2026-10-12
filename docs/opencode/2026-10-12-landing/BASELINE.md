# Baseline

- `node --check landing/landing.js`: OK
- `python3 -I -c "import json;d=json.load(open('landing/app.json',encoding='utf-8'));assert 'portalUrl' in d and d['apk']['version']=='0.9.0'"`: FAIL (portalUrl doesn't exist yet)
- `grep -q 'id="entrar"' landing/index.html`: FAIL (doesn't exist yet)
- `node scripts/test-api-client.mjs`: Pass (18/18)
