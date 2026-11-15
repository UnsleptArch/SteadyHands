import sys, os
from playwright.sync_api import sync_playwright
shots = sys.argv[1:] or ['abdomen', 'field', 'field&omentum=0&hl=appendix', 'thorax&infl=0', 'thorax&infl=1', 'neck', 'neck&comp=0.8']
os.makedirs('anat_out', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=gl-egl", "--ignore-gpu-blocklist", "--enable-gpu"])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: m.type in ('error', 'warning') and print('CONSOLE', m.text[:300]))
    pg.on('pageerror', lambda e: print('PAGEERR', e))
    for s in shots:
        pg.goto('http://localhost:8550/tests/_anatomy.html?set=' + s)
        pg.wait_for_function('window.__ready === true', timeout=60000)
        pg.wait_for_timeout(2500)
        print(s, pg.evaluate('window.__err'))
        pg.screenshot(path='anat_out/' + s.replace('&', '_').replace('=', '-') + '.png')
    b.close()
