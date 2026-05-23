# Lott-Bespitting Diode (LBD)

The **Lott-Bespitting Diode (LBD)** is a custom, high-intensity infrared (IR) blaster built on the RP2040 microcontroller. It uses a high-output, MOSFET-driven IR array to transmit standard 38kHz infrared signals (like the NEC protocol) directly from a browser interface over a USB serial connection.

---

# 1. System Architecture Overview

The system splits functionality symmetrically between an on-board hardware driver and a web-based serial terminal pipeline.

```text
+---------------------------------+             +----------------------------------+
|      Web Control Interface      |             |         LBD Hardware Core        |
|  (HTML5 / CSS3 Themes / JS)     |             |  (RP2040 MCU / CircuitPython)    |
|                                 |             |                                  |
|   +-------------------------+   |  WebSerial  |   +--------------------------+   |
|   |  Flipper-IRDB Directory |   |   Pipeline  |   |  NEC Protocol Engine     |   |
|   +-------------------------+   |             |   +--------------------------+   |
|                |                |  (USB CDC)  |                |                 |
|                v                |             |                v                 |
|   +-------------------------+   |  =======>   |   +--------------------------+   |
|   |  Raw Hex Compiler       |   |             |   |  MOSFET Gate Controller  |   |
|   +-------------------------+   |             |   +--------------------------+   |
+---------------------------------+             +----------------------------------+
                                                          |
                                                          v
                                           +--------------------------+
                                           | High-Intensity IR Matrix |
                                           +--------------------------+
```

---

# 2. Hardware Design & Schematics

*Schematic diagrams, 3D PCB renders, and assembly images will be uploaded once complete.*

---

# 3. Embedded Firmware Architecture

The firmware layer runs on top of a an internal clock loop to translate explicit string structures into precise, microsecond-timed hardware actions.

## Core Operations

* **NEC Protocol Synthesis:** Encodes raw hexadecimal data pairs (Address and Command) into standard NEC pulse-distance sequences
* **Carrier Modulation:** Generates a consistent, hardware-accurate 38kHz duty cycle inside the transmission window to pass standard consumer IR receiver filters
* **USB Data Ingestion:** Runs a non-blocking serial listen routine tracking inbound raw string inputs

## Example Firmware Loop

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

# 4. Setup & Flash Instructions

Depending on how you acquired your LBD system, select the appropriate configuration pipeline below.

## Option A — Plug-and-Play (Pre-Assembled Hardware)

If you received an assembled unit, the firmware layer is pre-flashed.

1. Plug the hardware unit directly into a USB port on your machine
2. Launch the control interface panel
3. Utilize the hosted web environment or follow the Local Interface Setup instructions below

## Option B — From-Scratch Assembly (DIY Build)

### Step 1 — Enter Bootloader Mode

Press and hold the **BOOT** button on the PCB, then connect it to your computer via a data-capable USB cable.

Release the button once the drive mounts.

### Step 2 — Mount Volume

A new mass storage volume named `RPI-RP2` will appear.

### Step 3 — Install CircuitPython

Drag and drop the appropriate CircuitPython `.uf2` payload directly onto the root directory of the `RPI-RP2` volume.

The board will automatically reboot and remount as:

```text
CIRCUITPY
```

### Step 4 — Deploy Application Code

Open the `/firmware` directory within this project workspace.

Copy the following onto the root of the `CIRCUITPY` volume:

* `code.py`
* `lib/`

---

# 5. Local Interface Setup

Because the Web Serial API requires a secure cross-origin network context, you cannot run the control interface panel directly using a raw `file://` payload.

## Launch Local Development Server

```bash
# 1. Navigate into the software workspace
cd lbd-project-portfolio/software

# 2. Launch a lightweight local server
python -m http.server 8080

# 3. Open the frontend dashboard
http://localhost:8080
```

---

# 6. License & Terms of Use

## Disclaimer

> [!CAUTION]
> **STRICTLY PROHIBITED FOR ILLEGAL USE**
> 
> This project is designed and intended solely for personal engineering research, hardware prototyping, and authorized testing.
> 
> You may only operate this device on infrared-receiving equipment that you personally own, or where you have received explicit permission from the equipment owner.
> 
> The creator of this project assumes absolutely no responsibility or liability for any misuse, property disruption, equipment damage, or infractions caused by the operation or assembly of this hardware and software. By using this project, you agree to take full responsibility for your actions and use it responsibly and legally.

## License

This project—including all software, firmware, schematics, PCB layouts, and documentation—is licensed under the **GNU General Public License v3.0 (GPL-3.0)**.

Copyright (c) 2026 Joshua Felder (Chaos). All Rights Reserved.

### Under these terms, anyone is free to:
*   **Share:** Copy, distribute, and hand out the files or physical hardware boards (including bare PCBs or kits) for free.
*   **Adapt:** Remix, transform, and build upon the design files for any personal or community project.

### Under the following conditions:
1.  **Attribution:** You must give appropriate credit to **Deterministic Chaos**, provide a link to the original repository, and indicate if any changes were made.
2.  **Non-Commercial:** You **may not** use the material, code, or physical hardware designs for commercial purposes or financial monetization. This means no selling assembled units, charging for component kits, or retailing bare PCBs.
3.  **ShareAlike:** If you remix, transform, or build upon these design files, you must distribute your contributions under the exact same CC BY-NC-SA 4.0 license terms.