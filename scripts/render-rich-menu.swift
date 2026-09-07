import AppKit
import Foundation

struct Area: Decodable {
  let bounds: Bounds
  let labelEn: String
  let labelTh: String
  let icon: String
  let fill: String?
}

struct Bounds: Decodable {
  let x: Int
  let y: Int
  let width: Int
  let height: Int
}

struct Layout: Decodable {
  let size: Size
  let areas: [Area]
}

struct Size: Decodable {
  let width: Int
  let height: Int
}

let teal = NSColor(srgbRed: 0x0B / 255, green: 0x6E / 255, blue: 0x6A / 255, alpha: 1)
let tealStrong = NSColor(srgbRed: 0x06 / 255, green: 0x3F / 255, blue: 0x3D / 255, alpha: 1)
let tealTint = NSColor(srgbRed: 0xE3 / 255, green: 0xF0 / 255, blue: 0xEE / 255, alpha: 1)
let gold = NSColor(srgbRed: 0xA9 / 255, green: 0x7A / 255, blue: 0x2B / 255, alpha: 1)
let goldTint = NSColor(srgbRed: 0xF4 / 255, green: 0xE9 / 255, blue: 0xD4 / 255, alpha: 1)
let canvas = NSColor(srgbRed: 0xF3 / 255, green: 0xF5 / 255, blue: 0xF4 / 255, alpha: 1)
let radius: CGFloat = 28
let pad: CGFloat = 20
let fontSize: CGFloat = 48
let iconStroke: CGFloat = 10

func fillColor(_ name: String?) -> NSColor {
  switch name {
  case "teal": return teal
  case "goldTint": return goldTint
  default: return tealTint
  }
}

func inkColor(_ name: String?) -> NSColor {
  switch name {
  case "teal": return .white
  case "goldTint": return gold
  default: return tealStrong
  }
}

func roundedRect(_ rect: NSRect, _ r: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: rect, xRadius: r, yRadius: r)
}

func strokeRoundedRect(_ rect: NSRect, _ r: CGFloat, width: CGFloat = iconStroke) {
  let path = roundedRect(rect, r)
  path.lineWidth = width
  path.lineCapStyle = .round
  path.lineJoinStyle = .round
  path.stroke()
}

func strokeIcon(_ kind: String, in box: NSRect, color: NSColor) {
  let cx = box.midX
  let cy = box.midY
  color.setStroke()
  color.setFill()
  let path = NSBezierPath()
  path.lineWidth = iconStroke
  path.lineCapStyle = .round
  path.lineJoinStyle = .round

  switch kind {
  case "home":
    path.move(to: NSPoint(x: cx - 36, y: cy - 4))
    path.line(to: NSPoint(x: cx, y: cy + 36))
    path.line(to: NSPoint(x: cx + 36, y: cy - 4))
    path.line(to: NSPoint(x: cx + 36, y: cy - 36))
    path.line(to: NSPoint(x: cx + 12, y: cy - 36))
    path.line(to: NSPoint(x: cx + 12, y: cy - 10))
    path.line(to: NSPoint(x: cx - 12, y: cy - 10))
    path.line(to: NSPoint(x: cx - 12, y: cy - 36))
    path.line(to: NSPoint(x: cx - 36, y: cy - 36))
    path.close()
    path.stroke()
  case "verify":
    let circle = NSBezierPath(ovalIn: NSRect(x: cx - 38, y: cy - 38, width: 76, height: 76))
    circle.lineWidth = iconStroke
    circle.stroke()
    let check = NSBezierPath()
    check.lineWidth = iconStroke
    check.lineCapStyle = .round
    check.lineJoinStyle = .round
    check.move(to: NSPoint(x: cx - 16, y: cy - 2))
    check.line(to: NSPoint(x: cx - 4, y: cy - 16))
    check.line(to: NSPoint(x: cx + 20, y: cy + 14))
    check.stroke()
  case "bag":
    path.move(to: NSPoint(x: cx - 32, y: cy + 8))
    path.line(to: NSPoint(x: cx + 32, y: cy + 8))
    path.line(to: NSPoint(x: cx + 24, y: cy - 36))
    path.line(to: NSPoint(x: cx - 24, y: cy - 36))
    path.close()
    path.move(to: NSPoint(x: cx - 14, y: cy + 8))
    path.line(to: NSPoint(x: cx - 14, y: cy + 22))
    path.curve(to: NSPoint(x: cx + 14, y: cy + 22), controlPoint1: NSPoint(x: cx - 14, y: cy + 38), controlPoint2: NSPoint(x: cx + 14, y: cy + 38))
    path.line(to: NSPoint(x: cx + 14, y: cy + 8))
    path.stroke()
  case "grid":
    for col in 0..<2 {
      for row in 0..<2 {
        let x = cx - 34 + CGFloat(col) * 38
        let y = cy - 34 + CGFloat(row) * 38
        strokeRoundedRect(NSRect(x: x, y: y, width: 30, height: 30), 5)
      }
    }
  case "help":
    let circle = NSBezierPath(ovalIn: NSRect(x: cx - 38, y: cy - 38, width: 76, height: 76))
    circle.lineWidth = iconStroke
    circle.stroke()
    let q = NSBezierPath()
    q.lineWidth = iconStroke
    q.lineCapStyle = .round
    q.move(to: NSPoint(x: cx - 12, y: cy + 10))
    q.curve(to: NSPoint(x: cx, y: cy - 6), controlPoint1: NSPoint(x: cx - 12, y: cy + 28), controlPoint2: NSPoint(x: cx + 16, y: cy + 22))
    q.line(to: NSPoint(x: cx, y: cy - 14))
    q.stroke()
    NSBezierPath(ovalIn: NSRect(x: cx - 4, y: cy - 30, width: 8, height: 8)).fill()
  default: // globe — meridians must use the same 8pt stroke as the rim
    let circle = NSBezierPath(ovalIn: NSRect(x: cx - 36, y: cy - 36, width: 72, height: 72))
    circle.lineWidth = iconStroke
    circle.lineCapStyle = .round
    circle.stroke()
    let meridian = NSBezierPath(ovalIn: NSRect(x: cx - 14, y: cy - 36, width: 28, height: 72))
    meridian.lineWidth = iconStroke
    meridian.lineCapStyle = .round
    meridian.stroke()
    let equator = NSBezierPath()
    equator.lineWidth = iconStroke
    equator.lineCapStyle = .round
    equator.move(to: NSPoint(x: cx - 36, y: cy))
    equator.line(to: NSPoint(x: cx + 36, y: cy))
    equator.stroke()
  }
}

guard CommandLine.arguments.count >= 4 else {
  fputs("usage: render-rich-menu.swift <layout.json> <en|th> <out.png>\n", stderr)
  exit(1)
}

let layoutPath = CommandLine.arguments[1]
let language = CommandLine.arguments[2]
let outPath = CommandLine.arguments[3]
let data = try Data(contentsOf: URL(fileURLWithPath: layoutPath))
let layout = try JSONDecoder().decode(Layout.self, from: data)
let width = layout.size.width
let height = layout.size.height

guard let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil,
  pixelsWide: width,
  pixelsHigh: height,
  bitsPerSample: 8,
  samplesPerPixel: 4,
  hasAlpha: true,
  isPlanar: false,
  colorSpaceName: .deviceRGB,
  bytesPerRow: 0,
  bitsPerPixel: 0
) else {
  exit(1)
}

NSGraphicsContext.saveGraphicsState()
guard let ctx = NSGraphicsContext(bitmapImageRep: rep) else { exit(1) }
NSGraphicsContext.current = ctx
canvas.setFill()
NSRect(x: 0, y: 0, width: width, height: height).fill()

let font = NSFont.systemFont(ofSize: fontSize, weight: .semibold)
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
paragraph.lineBreakMode = .byWordWrapping

for area in layout.areas {
  let x = CGFloat(area.bounds.x)
  let flippedY = CGFloat(height - area.bounds.y - area.bounds.height)
  let w = CGFloat(area.bounds.width)
  let h = CGFloat(area.bounds.height)
  let tile = NSRect(x: x + pad, y: flippedY + pad, width: w - pad * 2, height: h - pad * 2)
  fillColor(area.fill).setFill()
  roundedRect(tile, radius).fill()
  let ink = inkColor(area.fill)
  strokeIcon(area.icon, in: NSRect(x: tile.minX, y: tile.midY + 8, width: tile.width, height: tile.height * 0.45), color: ink)
  let label = language == "th" ? area.labelTh : area.labelEn
  let attrs: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: ink,
    .paragraphStyle: paragraph,
  ]
  let labelRect = NSRect(x: tile.minX + 12, y: tile.minY + 28, width: tile.width - 24, height: 110)
  (label as NSString).draw(in: labelRect, withAttributes: attrs)
}

NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else { exit(1) }
try png.write(to: URL(fileURLWithPath: outPath))
print("wrote \(outPath)")
