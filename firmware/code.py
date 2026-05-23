import sys
import time
import board
import pulseio
import digitalio
import adafruit_irremote

status_led = digitalio.DigitalInOut(board.GP16)
status_led.direction = digitalio.Direction.OUTPUT

pulseout = pulseio.PulseOut(board.GP0, frequency=38000, duty_cycle=2**15)

encoder = adafruit_irremote.GenericTransmit(
    header=[9000, 4500],
    one=[560, 1690],
    zero=[560, 560],
    trail=560
)

try:
    import select
except ImportError:
    import pulseio as select

print("[SYS] Core firmware engine online.\r")
print("[SYS] Awaiting pre-compiled 4-byte arrays from web controller...\r")

input_buffer = ""

while True:
    if sys.stdin in select.select([sys.stdin], [], [], 0)[0]:
        char = sys.stdin.read(1)
        
        if char == "\n" or char == "\r":
            clean_package = input_buffer.strip()
            
            if clean_package:
                try:
                    nec_payload = [int(x) for x in clean_package.split(",")]
                    
                    if len(nec_payload) != 4:
                        print(f"[ERR] Packet rejected! Expected 4 bytes, received {len(nec_payload)}\r")
                    else:
                        status_led.value = True
                        print(f"[HW] Processing transmission stream array -> {nec_payload}\r")
                        
                        encoder.transmit(pulseout, nec_payload)
                            
                        print("[OK] Signal cleared output hardware timers.\r")
                        
                except ValueError:
                    print("[ERR] Packet corrupted! Array items must be purely comma-separated integers.\r")
                except Exception as error:
                    print(f"[ERR] Hardware collision: {error}\r")
                
                status_led.value = False
                
            input_buffer = ""
        else:
            input_buffer += char
            
    time.sleep(0.001)