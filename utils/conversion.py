import time
import board
import pulseio
import adafruit_irremote

pulseout = pulseio.PulseOut(board.GP0, frequency=38000, duty_cycle=2**15)

encoder = adafruit_irremote.GenericTransmit(
    header=[9000, 4500],
    one=[560, 1690],
    zero=[560, 560],
    trail=560
)

def flip_byte(b):
    flipped = 0
    for i in range(8):
        if (b >> i) & 1:
            flipped |= (1 << (7 - i))
    return flipped

def convert_flipper_to_nec(f_address, f_command):
    addr_byte = int(f_address.split()[0], 16)
    cmd_byte = int(f_command.split()[0], 16)
    
    addr_flipped = flip_byte(addr_byte)
    cmd_flipped = flip_byte(cmd_byte)

    addr_inverse = addr_flipped ^ 0xFF
    cmd_inverse = cmd_flipped ^ 0xFF
    
    return [addr_flipped, addr_inverse, cmd_flipped, cmd_inverse]

print("ready")

def send_ir_signal(f_address, f_command):
    cmd = convert_flipper_to_nec(f_address, f_command)
    print(f"Sending IR Signal (Encoded Array: {cmd})...")
    
    encoder.transmit(pulseout, cmd)
    time.sleep(0.04)

send_ir_signal('20 00 00 00', '09 00 00 00')