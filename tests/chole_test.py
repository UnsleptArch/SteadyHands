# usage: python tests/chole_test.py   env PORT, OUT
import os, sys, time, json
from playwright.sync_api import sync_playwright
PORT=os.environ.get("PORT","8511"); OUT=os.environ.get("OUT","chole_out"); os.makedirs(OUT,exist_ok=True)
SAFE=os.environ.get("SAFE","")
args=["--use-gl=angle","--use-angle=gl-egl","--ignore-gpu-blocklist","--enable-gpu"]
with sync_playwright() as p:
    b=p.chromium.launch(args=args)
    pg=b.new_page(viewport={"width":1920,"height":1080})
    errs=[]
    pg.on("console", lambda m: errs.append(m.type+": "+m.text) if m.type in ("error","warning") else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: "+str(e)))
    pg.on("crash", lambda: print("PAGE CRASH", flush=True))
    pg.goto(f"http://localhost:{PORT}/"+("?safe=1" if SAFE else ""))
    pg.wait_for_function("window.game && window.game.ready", timeout=60000)
    pg.evaluate("()=>{window.game.bot('cholecystectomy').then(r=>window.__botres=r).catch(e=>window.__boterr=String(e)); return 1}")
    pg.evaluate("()=>{window.__toasts=[];window.__fr=0;(function f(){window.__fr++;requestAnimationFrame(f)})();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes){if(n.classList&&n.classList.contains('sgb-t'))window.__toasts.push(Math.round(performance.now()/100)/10+' '+n.className.replace('sgb-t ','')+': '+n.textContent)}}).observe(document.body,{subtree:true,childList:true});return 1}")
    t0=time.time(); last=None; shots=0; seen=set()
    while time.time()-t0<330:
        s=pg.evaluate("(()=>{const s=window.game.state(); const t=document.querySelector('.sgb-title'); const pill=document.querySelector('.sgb-pill'); const ins=document.querySelector('.sgb-instr'); return {lvl:s.level, prog:s.progress, title:t&&t.textContent, pill:pill&&pill.textContent, instr:ins&&ins.textContent, res:!!document.querySelector('.sh-results, .results, [class*=result]')}})()")
        key=(s["pill"],s["title"])
        if key not in seen:
            seen.add(key); print(round(time.time()-t0,1), json.dumps(s)); 
            time.sleep(2.5); pg.screenshot(path=f"{OUT}/step_{len(seen):02d}.png")
        if s.get("prog") and isinstance(s["prog"],dict) and s["prog"].get("pct",0)>=1: pass
        sc=pg.evaluate("window.__score||null")
        time.sleep(0.5)
        st=pg.evaluate("window.game.state()")
        if st.get("done") or st.get("grade"):
            print("DONE", json.dumps(st)[:800]); time.sleep(1.5); pg.screenshot(path=f"{OUT}/final.png"); break
    else:
        print("TIMEOUT", json.dumps(pg.evaluate("window.game.state()"))[:800]); pg.screenshot(path=f"{OUT}/timeout.png")
    print("FPS", pg.evaluate("window.__fr")/(time.time()-t0)); [print(" T",x) for x in pg.evaluate("window.__toasts")]
    print("ERRORS:", len(errs)); [print(" ",e[:300]) for e in errs[:30]]
    b.close()
