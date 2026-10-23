#!/usr/bin/env python3
"""Download CC BY, CC BY-SA, CC0, or public-domain Commons photos for makes and models.

Skips a page when no acceptably licensed photograph matches the name.
Writes WebP files under src/assets/images/vehicles and src/_data/vehicleImages.json.
"""

import html
import json
import re
import time
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "src" / "assets" / "images" / "vehicles"
DATA_PATH = ROOT / "src" / "_data" / "vehicleImages.json"
API = "https://commons.wikimedia.org/w/api.php"
UA = "CarAlphaCatalog/1.0 (https://caralpha.org; vehicle-photo-attribution)"
MAX_WIDTH = 960

REJECT_TITLE = re.compile(
    r"logo|wordmark|emblem|badge|coat of arms|trademark|pictogram|icon|dealer plate|press kit|advertisement|headquarters|factory|assembly plant|motor show|auto show|autoshow|panoramio|dealership",
    re.I,
)


def norm(value):
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def ok_license(name):
    n = (name or "").strip().lower()
    if not n or "nc" in n.split() or re.search(r"\bnc\b|-nc|nd\b|-nd", n):
        return False
    if n.startswith("cc by-sa") or n.startswith("cc-by-sa"):
        return True
    if n.startswith("cc by") or n.startswith("cc-by"):
        return True
    if n.startswith("cc0") or "public domain" in n or n in {"pd", "pd-us"}:
        return True
    return False


def strip_html(value):
    text = re.sub(r"<[^>]+>", " ", value or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*\([^)]*wikimedia[^)]*\)", "", text, flags=re.I).strip(" ,")
    return text[:140] or "Wikimedia Commons contributor"


def api(params):
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=40) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as exc:
            if attempt == 3:
                print("api fail", exc)
                return {}
            time.sleep(1.5 * (attempt + 1))
    return {}


def candidates(query):
    data = api({
        "action": "query",
        "format": "json",
        "generator": "search",
        "gsrsearch": query,
        "gsrnamespace": "6",
        "gsrlimit": "8",
        "prop": "imageinfo",
        "iiprop": "url|size|mime|extmetadata",
        "iiurlwidth": str(MAX_WIDTH),
        "iiextmetadatafilter": "LicenseShortName|Artist|LicenseUrl",
    })
    pages = (data.get("query") or {}).get("pages") or {}
    found = []
    for page in pages.values():
        info = (page.get("imageinfo") or [{}])[0]
        meta = info.get("extmetadata") or {}
        license_name = (meta.get("LicenseShortName") or {}).get("value") or ""
        title = page.get("title") or ""
        if not ok_license(license_name):
            continue
        if REJECT_TITLE.search(title):
            continue
        thumb = info.get("thumburl") or info.get("url")
        width = info.get("thumbwidth") or info.get("width") or 0
        height = info.get("thumbheight") or info.get("height") or 0
        if not thumb or width < 480:
            continue
        mime = info.get("mime") or ""
        if not mime.startswith("image/") or mime == "image/svg+xml":
            continue
        found.append({
            "title": title,
            "url": thumb,
            "width": width,
            "height": height,
            "license": license_name.strip(),
            "licenseUrl": ((meta.get("LicenseUrl") or {}).get("value") or "").strip(),
            "author": strip_html((meta.get("Artist") or {}).get("value") or ""),
            "mime": mime,
        })
    time.sleep(0.25)
    return found


def score(item, required):
    title = norm(item["title"])
    points = 0
    for token in required:
        if token and token in title:
            points += 12
        else:
            return -1
    if item["width"] >= item["height"]:
        points += 3
    if "jpeg" in item["mime"] or "jpg" in item["mime"]:
        points += 2
    if "interior" in item["title"].lower() or "engine" in item["title"].lower():
        points -= 4
    return points


def pick(queries, required):
    best = None
    best_score = -1
    seen = set()
    for query in queries:
        for item in candidates(query):
            if item["title"] in seen:
                continue
            seen.add(item["title"])
            value = score(item, required)
            if value > best_score:
                best = item
                best_score = value
    return best


def save_webp(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as res:
        raw = res.read()
    if len(raw) > 12_000_000:
        raise RuntimeError("too large")
    image = Image.open(BytesIO(raw))
    image = image.convert("RGB")
    if image.width > MAX_WIDTH:
        height = round(image.height * MAX_WIDTH / image.width)
        image = image.resize((MAX_WIDTH, height), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "WEBP", quality=72, method=4)
    return image.width, image.height


def record(item, dest, alt):
    return {
        "src": "/assets/images/vehicles/" + dest.name,
        "width": item["saved_width"],
        "height": item["saved_height"],
        "alt": alt,
        "author": item["author"],
        "license": item["license"],
        "licenseUrl": item["licenseUrl"],
        "source": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(item["title"].replace(" ", "_"), safe=":/()"),
        "file": item["title"],
    }


def main():
    makes = json.loads((ROOT / "src" / "_data" / "makes.json").read_text())
    models = json.loads((ROOT / "src" / "_data" / "models.json").read_text())
    manifest = {"makes": {}, "models": {}}
    if DATA_PATH.exists():
        manifest = json.loads(DATA_PATH.read_text())
        manifest.setdefault("makes", {})
        manifest.setdefault("models", {})

    def already(kind, key, filename):
        entry = manifest[kind].get(key)
        path = OUT_DIR / filename
        return entry and path.exists() and entry.get("src", "").endswith(filename)

    for make in makes:
        filename = f"{make['slug']}.webp"
        if already("makes", make["slug"], filename):
            continue
        required = [norm(make["name"])]
        chosen = pick([
            f"{make['name']} automobile filetype:bitmap",
            f"{make['name']} car filetype:bitmap",
        ], required)
        if not chosen:
            print("skip make", make["slug"])
            continue
        try:
            width, height = save_webp(chosen["url"], OUT_DIR / filename)
        except Exception as exc:
            print("fail make", make["slug"], exc)
            continue
        chosen["saved_width"] = width
        chosen["saved_height"] = height
        manifest["makes"][make["slug"]] = record(chosen, OUT_DIR / filename, f"{make['name']} vehicle")
        DATA_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
        print("make", make["slug"], chosen["license"], chosen["title"])

    for model in models:
        key = f"{model['makeSlug']}/{model['slug']}"
        filename = f"{model['makeSlug']}-{model['slug']}.webp"
        if already("models", key, filename):
            continue
        required = [norm(model["name"])]
        make_token = norm(model["makeName"])
        if make_token and make_token not in norm(model["name"]):
            required.append(make_token)
        chosen = pick([
            f"{model['makeName']} {model['name']} filetype:bitmap",
            f"\"{model['makeName']} {model['name']}\" filetype:bitmap",
        ], required)
        if not chosen:
            print("skip model", key)
            continue
        try:
            width, height = save_webp(chosen["url"], OUT_DIR / filename)
        except Exception as exc:
            print("fail model", key, exc)
            continue
        chosen["saved_width"] = width
        chosen["saved_height"] = height
        manifest["models"][key] = record(
            chosen,
            OUT_DIR / filename,
            f"{model['makeName']} {model['name']}",
        )
        DATA_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
        print("model", key, chosen["license"], chosen["title"])

    print("done", "makes", len(manifest["makes"]), "models", len(manifest["models"]))


if __name__ == "__main__":
    main()
