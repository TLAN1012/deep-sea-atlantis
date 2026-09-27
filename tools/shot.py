"""Screenshot the game in headless Chromium.  shot.py out_prefix [scenario...]
scenario: name:x,y,z,yaw,pitch[,lamp][,diver]  e.g. reef:0,-10,-20,0,-0.2
Run with ~/pwtest/.venv/bin/python and LD_LIBRARY_PATH=~/pwtest/libs/usr/lib/x86_64-linux-gnu
"""
import sys, time
from playwright.sync_api import sync_playwright

out = sys.argv[1]
scen = sys.argv[2:] or ["start:0,-8,-20,0,-0.15"]
mobile = "--mobile" in sys.argv
scen = [s for s in scen if not s.startswith("--")]
with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
    vp = {"width": 844, "height": 390} if mobile else {"width": 1280, "height": 720}
    pg = b.new_page(viewport=vp, has_touch=mobile, device_scale_factor=1)
    logs = []
    pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    pg.on("pageerror", lambda e: logs.append(f"PAGEERROR: {e}"))
    pg.goto("http://127.0.0.1:8190/index.html")
    pg.wait_for_function("!document.getElementById('start').disabled || document.getElementById('start').textContent.includes('失敗')", timeout=180000)
    pg.screenshot(path=f"{out}_title.png")
    pg.click("#start")
    for s in scen:
        name, vals = s.split(":")
        v = vals.split(",")
        x, y, z, yaw, pitch = map(float, v[:5])
        flags = v[5:]
        pg.evaluate(f"""() => {{ const g = window.__game, P = g.player;
            if ({'true' if 'diver' in flags else 'false'} && P.inSub) g.toggleSub();
            P.pos.set({x},{y},{z}); P.subPos.set({x}+3,{y},{z}); P.camYaw={yaw}; P.camPitch={pitch}; P.yaw={yaw};
            P.lampOn = {'true' if 'lamp' in flags else 'false'}; P.vel.set(0,0,0);
            {'g.awaken(true);' if 'awake' in flags else ''} }}""")
        time.sleep(4)
        pg.screenshot(path=f"{out}_{name}.png")
    print("\n".join(logs[-30:]))
    b.close()
