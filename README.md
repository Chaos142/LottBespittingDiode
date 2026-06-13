# Lott-Bespitting Diode (LBD)

A high-intensity IR blaster built on the RP2040. Browser-native control over WebSerial, MOSFET-driven IR output, 38kHz NEC modulation. Fully open source.

[Home Page](https://chaowoses.github.io/LottBespittingDiode/) &middot; [Controller](https://chaowoses.github.io/LottBespittingDiode/controller.html)

Named for Mrs. Lott, the worst teacher I ever had, and her classroom projector.

---

## Features

- **Web Controller**: Full single-page app to manage IR remotes, browse the Flipper-IRDB, compose NEC signals, and transmit over WebSerial
- **In-Browser Schematic Viewer**: Browse all hardware schematics directly on the landing page via KiCanvas
- **Auto-Generated BOM**: Bill of materials extracted from KiCad schematics and embedded in the landing page, updated on every push
- **IRDB Integration**: Browse and import from [Lucaslhm/Flipper-IRDB](https://github.com/Lucaslhm/Flipper-IRDB) directly from the controller
- **NEC Protocol Engine**: CircuitPython firmware with hardware-timed 38kHz carrier modulation
- **Library Management**: Organize remotes and signals in folders with drag-and-drop, favorites, and inline editing

---

## Project Structure

```
app/                  # Web front-end
  index.html          # Landing page (hero, BOM, schematic viewer, docs)
  index.css           # Landing page styles (dark theme, purple/amber)
  index.js            # Landing page interactivity (tabs, viewer)
  controller.html     # WebSerial controller app
  style.css           # Controller styles
  script.js           # Controller logic (serial, library, IRDB, transmit)
  three-scene.js      # Three.js particle background

firmware/             # CircuitPython firmware
  code.py             # NEC protocol engine over USB serial
  lib/                # Runtime libraries

hardware/             # KiCad hardware design
  LBD.kicad_sch       # Main schematic (RP2040, MOSFET, IR matrix)
  power.kicad_sch     # Power regulation (TPSM828214SILR)
  flash.kicad_sch     # External flash (W25Q128)
  usb.kicad_sch       # USB-C (USB4155)
  prototype/prototype.kicad_sch # Breadboard/perfboard prototype variant
  LBD.kicad_pcb       # PCB layout

scripts/              # Utility scripts
  generate_bom.py     # Auto-generates BOM HTML from KiCad schematics
  ir_tester.py        # Standalone IR transmission test
```

---

## Hardware

> The embedded PCB design isn't finalized yet. Build the prototype on a breadboard or perfboard using the [prototype schematic](hardware/prototype.kicad_sch).

The full design targets a custom PCB with an RP2040, MOSFET-switched IR LED array, USB-C, and external flash. Five KiCad schematics cover the main board, power regulation, flash memory, USB connector, and a simplified prototype variant.

---

## Firmware

The [CircuitPython firmware](firmware/code.py) implements a standard NEC protocol engine:

- 38kHz carrier modulation via `pulseio.PulseOut`
- Listens for 4-byte NEC arrays over USB serial
- Drives a status LED and the IR output on GPIO
- Header: 9000&micro;s mark / 4500&micro;s space
- Bit coding: 560&micro;s mark + 1690&micro;s (1) or 560&micro;s (0)
- Compatible with any NEC IR receiver

```python
import time
import board
import pwmio

# 38kHz carrier wave initialization
ir_pwm = pwmio.PWMOut(board.GP16, frequency=38000, duty_cycle=0)

def pulse_nec(mark_us, space_us):
    # Enable carrier wave modulation for duration of mark
    ir_pwm.duty_cycle = 32768  # 50% duty cycle
    time.sleep_us(mark_us)

    # Disable carrier wave modulation for duration of space
    ir_pwm.duty_cycle = 0
    time.sleep_us(space_us)
```

---

## Web Interface

Two pages are served via GitHub Pages:

| Page | Description |
|---|---|
| **Landing Page** (`index.html`) | Project overview, BOM table, KiCanvas schematic viewer, architecture docs, features, setup guide |
| **Controller** (`controller.html`) | Full WebSerial-based remote control app with library management, IRDB browser, signal composer, and transmit history |

---

## Setup & Flash

> Build the prototype on a breadboard or perfboard using the [prototype schematic](hardware/prototype.kicad_sch).

<details>
<summary><strong>DIY / Prototype Only</strong>: Steps 1 and 2 (skip if you have a pre-assembled unit)</summary>

### Step 1: Enter Bootloader Mode

Press and hold the **BOOT** button on the board, then connect it to your computer via a data-capable USB cable. Release the button once the drive mounts.

### Step 2: Install CircuitPython

A mass storage volume named `RPI-RP2` will appear. Drag and drop the appropriate CircuitPython `.uf2` payload onto its root directory. The board will automatically reboot and remount as `CIRCUITPY`.

</details>

### Step 3: Deploy Firmware

Copy the contents of `firmware/` onto the `CIRCUITPY` volume root:

- `code.py`
- `lib/`

### Step 4: Plug It In & Open the Controller

Keep the device connected via USB, then open the [web controller](https://chaowoses.github.io/LottBespittingDiode/controller.html) in a Chromium-based browser. Click **Connect** to establish the WebSerial session.

To run locally (required for development):

```bash
git clone https://github.com/chaowoses/LottBespittingDiode.git
cd LottBespittingDiode
python -m http.server 8080
# open http://localhost:8080
```

---

## License & Terms of Use

> [!CAUTION]
> **STRICTLY PROHIBITED FOR ILLEGAL USE**
>
> This project is designed solely for personal engineering research, hardware prototyping, and authorized testing.
> You may only operate this device on equipment you personally own or have explicit permission to control.
> The creator assumes no liability for misuse, property disruption, or equipment damage.

This project (software, firmware, schematics, PCB layouts, and documentation) is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

Copyright &copy; 2026 Josh Felder (Chaos). All Rights Reserved.
