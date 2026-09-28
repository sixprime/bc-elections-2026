import base64
import html
import io
import json
import math
import sys
from html.parser import HTMLParser
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


class StaticPage(HTMLParser):
    def __init__(self, page, site):
        super().__init__(convert_charrefs=False)
        self.page = page
        self.site = site
        self.output = []
        self.skip = None
        self.in_head = False

    def handle_starttag(self, tag, attributes):
        if self.skip:
            return
        values = dict(attributes)
        if tag == "head":
            self.in_head = True
            self.output.append("<head>\n")
            return
        if self.in_head:
            if tag == "title" or (tag == "script" and "data-page-schema" in values):
                self.skip = tag
                return
            if tag == "meta" and (values.get("name") in ["description", "robots", "site-url"] or values.get("name", "").startswith("twitter:") or values.get("property", "").startswith("og:")):
                return
            if tag == "link" and values.get("rel") in ["canonical", "sitemap"]:
                return
        for attribute in ["href", "src"]:
            if values.get(attribute, "").startswith("./"):
                values[attribute] = self.page["prefix"] + values[attribute][2:]
        if "data-route" in values:
            values["href"] = self.page["links"][values["data-route"]]
        if "data-nav" in values:
            classes = [name for name in values.get("class", "").split() if name != "active"]
            if values["data-nav"] == self.page["section"]:
                values["aria-current"] = "page"
                classes.append("active")
            else:
                values.pop("aria-current", None)
            if classes:
                values["class"] = " ".join(classes)
            else:
                values.pop("class", None)
        if values.get("id") == "snapshotStatus":
            values.pop("data-i18n", None)
        serialized = "".join(f' {name}' if value is None else f' {name}="{html.escape(value, quote=True)}"' for name, value in values.items())
        ending = "/>" if tag in ["path", "circle"] else ">"
        self.output.append(f'{"  " if self.in_head else ""}<{tag}{serialized}{ending}{chr(10) if self.in_head else ""}')
        if tag == "main":
            self.output.append("\n    " + self.page["content"] + "\n  ")
            self.skip = "main"
        elif values.get("id") in ["snapshotStatus", "countdown"]:
            message = self.page["snapshot"] if values["id"] == "snapshotStatus" else self.page["electionDay"]
            self.output.append(html.escape(message))
            self.skip = tag

    def handle_endtag(self, tag):
        if self.skip:
            if self.skip == tag:
                self.skip = None
                if tag in ["main", "span"]:
                    self.output.append(f"</{tag}>")
            return
        if tag == "head":
            self.output.append(self.metadata())
            self.in_head = False
        if tag in ["path", "circle"]:
            return
        self.output.append(f"</{tag}>")

    def handle_startendtag(self, tag, attributes):
        self.handle_starttag(tag, attributes)

    def handle_data(self, data):
        if not self.skip and (not self.in_head or data.strip()):
            self.output.append(data.strip() if self.in_head else data)

    def handle_entityref(self, name):
        if not self.skip:
            self.output.append(f"&{name};")

    def handle_charref(self, name):
        if not self.skip:
            self.output.append(f"&#{name};")

    def handle_decl(self, declaration):
        self.output.append(f"<!{declaration}>")

    def metadata(self):
        page = self.page
        escape = lambda value: html.escape(str(value), quote=True)
        fields = {
            "og:type": "website", "og:site_name": "BC Election Guide", "og:locale": "en_CA",
            "og:title": page["title"], "og:description": page["description"], "og:url": page["url"],
            "og:image": page["image"], "og:image:secure_url": page["image"], "og:image:type": "image/png",
            "og:image:width": "1200", "og:image:height": "630", "og:image:alt": page["imageAlt"],
        }
        twitter = {"card": "summary_large_image", "title": page["title"], "description": page["description"], "image": page["image"], "image:alt": page["imageAlt"]}
        schema = {"@context": "https://schema.org", "@type": "WebPage", "name": page["title"], "description": page["description"], "url": page["url"], "image": page["image"], "inLanguage": "en-CA"}
        content = [f'  <title>{escape(page["title"])}</title>', f'  <meta name="description" content="{escape(page["description"])}">', f'  <meta name="robots" content="{"index,follow" if page["indexable"] else "noindex,follow"}">', f'  <meta name="site-url" content="{escape(self.site)}">', f'  <link rel="canonical" href="{escape(page["url"])}">', f'  <link rel="sitemap" type="application/xml" href="{escape(self.site + "sitemap.xml")}">']
        content.extend(f'  <meta property="{name}" content="{escape(value)}">' for name, value in fields.items())
        content.extend(f'  <meta name="twitter:{name}" content="{escape(value)}">' for name, value in twitter.items())
        serialized = json.dumps(schema, ensure_ascii=True).replace("<", "\\u003c")
        content.append(f'  <script type="application/ld+json" data-page-schema>{serialized}</script>')
        return "\n".join(content) + "\n"


def font_file(requested):
    choices = [requested, "C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
    for choice in choices:
        if choice and Path(choice).is_file():
            return choice
    raise RuntimeError("Set BC_PREVIEW_FONT to a TrueType font for preview rendering.")


def wrapped_text(draw, value, font, width):
    lines = []
    current = ""
    for word in value.split():
        candidate = f"{current} {word}" if current else word
        if current and draw.textlength(candidate, font=font) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_boundary(draw, features):
    polygons = []
    for feature in features:
        geometry = feature["geometry"]
        if geometry["type"] == "Polygon":
            polygons.append(geometry["coordinates"])
        elif geometry["type"] == "MultiPolygon":
            polygons.extend(geometry["coordinates"])
    coordinates = [coordinate for polygon in polygons for ring in polygon for coordinate in ring]
    if not coordinates:
        raise ValueError("Preview requires official boundary coordinates.")
    middle_latitude = sum(coordinate[1] for coordinate in coordinates) / len(coordinates)
    longitude_scale = math.cos(math.radians(middle_latitude))
    project = lambda coordinate: (coordinate[0] * longitude_scale, -coordinate[1])
    projected = [project(coordinate) for coordinate in coordinates]
    minimum_x = min(coordinate[0] for coordinate in projected)
    maximum_x = max(coordinate[0] for coordinate in projected)
    minimum_y = min(coordinate[1] for coordinate in projected)
    maximum_y = max(coordinate[1] for coordinate in projected)
    scale = min(348 / (maximum_x - minimum_x), 380 / (maximum_y - minimum_y))
    left = 784 + (348 - (maximum_x - minimum_x) * scale) / 2
    top = 144 + (380 - (maximum_y - minimum_y) * scale) / 2
    for polygon in polygons:
        for index, ring in enumerate(polygon):
            points = [(left + (project(coordinate)[0] - minimum_x) * scale, top + (project(coordinate)[1] - minimum_y) * scale) for coordinate in ring]
            draw.polygon(points, fill="#d2e8e8" if index == 0 else "#f3f6fa", outline="#315c70", width=2)


def preview(page, features, font_path):
    image = Image.new("RGB", (1200, 630), "#f3f6fa")
    draw = ImageDraw.Draw(image)
    font = lambda size: ImageFont.truetype(font_path, size)
    draw.rectangle((0, 0, 1200, 100), fill="#102b50")
    draw.text((54, 26), "BC Election Guide", font=font(34), fill="#ffffff")
    draw.text((1040, 25), "2026", font=font(36), fill="#ffffff")
    label = "RIDING GUIDE" if page["name"] else "PROVINCIAL ELECTION"
    draw.text((56, 148), label, font=font(19), fill="#3f647a")
    title = page["name"] or page["heading"]
    size = 54
    while True:
        title_font = font(size)
        lines = wrapped_text(draw, title, title_font, 654)
        if len(lines) <= 3 and max(draw.textlength(line, font=title_font) for line in lines) <= 654:
            break
        size -= 1
        if size < 24:
            raise ValueError(f"Preview title does not fit: {title}")
    for index, line in enumerate(lines):
        draw.text((54, 195 + index * (size + 10)), line, font=title_font, fill="#163c57")
    details = {
        "province": ["Candidates, ridings and original sources", "Your province. Your voice. Your choice."],
        "ridings": ["93 official electoral districts", "Candidates and historical results"],
        "candidates": ["Source-linked candidate records", "Nominations and party announcements"],
        "parties": ["Party programmes in their own words", "Exact quotations and original sources"],
        "polls": ["Professional polls and historical data", "Original releases. No seat forecast."],
        "about": ["Sources, methodology and privacy", "Independent and unofficial"],
    }.get(page["route"], ["2026 candidates and original sources", "Official 2024 results"])
    for index, detail in enumerate(details):
        draw.text((56, 449 + index * 32), detail, font=font(22), fill="#3f5d71")
    selected = [feature for feature in features if feature["properties"].get("slug") == page["route"].removeprefix("riding/")] if page["name"] else features
    draw_boundary(draw, selected)
    draw.line((54, 552, 1146, 552), fill="#bacbd8", width=2)
    draw.text((56, 573), "Independent and unofficial", font=font(18), fill="#294c64")
    licence = "Contains information licenced under the Elections BC Open Data Licence"
    licence_font = font(15)
    draw.text((1146 - draw.textlength(licence, font=licence_font), 577), licence, font=licence_font, fill="#3f5d71")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def main():
    payload = json.load(sys.stdin)
    font_path = font_file(payload.get("font"))
    files = []
    for page in payload["pages"]:
        parser = StaticPage(page, payload["site"])
        parser.feed(payload["shell"])
        parser.close()
        document = "".join(parser.output).rstrip()
        document = "\n".join(line if line.strip(" \t") else "" for line in document.split("\n"))
        files.append({"path": page["path"], "text": document + "\n"})
        if page["indexable"]:
            files.append({"path": page["imagePath"], "base64": preview(page, payload["geometry"]["features"], font_path)})
    json.dump(files, sys.stdout, ensure_ascii=True)


if __name__ == "__main__":
    main()
