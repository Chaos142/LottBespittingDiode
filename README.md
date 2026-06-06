# Lott-Bespitting Diode (LBD)

The **Lott-Bespitting Diode (LBD)** is a custom, high-intensity infrared (IR) blaster built on the RP2040 microcontroller. It uses a high-output, MOSFET-driven IR array to transmit standard 38kHz infrared signals (like the NEC protocol) directly from a browser interface over a USB serial connection.

Named for Mrs. Lott, the worst teacher I ever had, and her classroom projector.

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
3. Utilize the hosted web environment or follow the Control Interface instructions below

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

# 5. Control Interface Access

## Option A — Hosted Web Interface (Recommended)

The latest stable version of the control panel is available through GitHub Pages:

[Launch LBD Control Interface](https://chaos142.github.io/LottBespittingDiode/)

Simply connect the LBD hardware via USB, open the page in a Chromium-based browser, and use the Connect button to establish a Web Serial session.

---

## Option B — Local Development Interface

Because the Web Serial API requires a secure context, you cannot run the interface directly from a `file://` URL.

### Launch Local Development Server

```bash
# Clone the repository
git clone https://github.com/Chaos142/LottBespittingDiode.git

# Enter the project directory
cd LottBespittingDiode

# Start a local web server (example using Python)
python -m http.server 8080

# Open in your browser
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

Copyright (c) 2026 Josh Felder (Chaos). All Rights Reserved.

### Core Terms:
*   **Open Access & Freedom:** Anyone is free to run, study, modify, and distribute this software and hardware design documentation.
*   **Copyleft Protection:** If anyone modifies these files or builds a derivative project and distributes it (either as code or as physical hardware), they **must** make their modified source code and design layouts publicly available under the GPL-3.0.
*   **Commercial Use:** Commercial manufacturing and distribution are permitted, provided the distributor complies fully with the open-source disclosure requirements of the GPL-3.0.
*   **No Warranty:** This project is provided "as is" without any warranty of any kind.