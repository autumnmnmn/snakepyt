#!/usr/bin/env python3
from Xlib import X, display, protocol, Xatom
from Xlib.xobject import drawable
import sys
import struct

dpy = display.Display()
screen = dpy.screen()
root = screen.root

# create 1x1 invisible junk window
win = root.create_window(
    -10, -10, 1, 1, 0,
    screen.root_depth,
    X.InputOutput,
    X.CopyFromParent,
)

# intern all the atoms we need
XdndAware = dpy.intern_atom('XdndAware')
XdndEnter = dpy.intern_atom('XdndEnter')
XdndPosition = dpy.intern_atom('XdndPosition')
XdndStatus = dpy.intern_atom('XdndStatus')
XdndDrop = dpy.intern_atom('XdndDrop')
XdndFinished = dpy.intern_atom('XdndFinished')
XdndActionCopy = dpy.intern_atom('XdndActionCopy')
XdndTypeList = dpy.intern_atom('XdndTypeList')
text_uri_list = dpy.intern_atom('text/uri-list')

# advertise xdnd version 5
win.change_property(XdndAware, Xatom.ATOM, 32, [5])

file_uri = b'file:///home/ponder/data0/media/images/screenshots/2026-02-10-195120_349x90_scrot.png\n\x00'

def get_window_at_pointer():
    """find the actual window under the cursor"""
    ptr = root.query_pointer()
    x, y = ptr.root_x, ptr.root_y
    
    # walk down window tree to find deepest child at this position
    child = root
    while True:
        ptr = child.query_pointer()
        if ptr.child == 0:
            break
        child = dpy.create_resource_object('window', ptr.child)
    return child, x, y


def send_xdnd_enter(target_win):
    wid = target_win.id if hasattr(target_win, 'id') else target_win
    # Version 5, bit1=1 (supports 32-bit coords), bit0=0 (≤3 types)
    flags = (5 << 24) | (1 << 1) | 1
    data = [
        win.id,
        flags,
        text_uri_list,  # only type (inline)
        0, 0
    ]
    event = protocol.event.ClientMessage(
        window=wid,
        client_type=XdndEnter,
        data=(32, data)
    )
    target_win.send_event(event, event_mask=0)
    dpy.flush()



def send_xdnd_position(target_win, x, y, time=X.CurrentTime):
    wid = target_win.id if hasattr(target_win, 'id') else target_win
    coords = (x << 16) | y

    # Use real time if possible; CurrentTime is okay but some targets delay reply
    #if time == X.CurrentTime:
    #    time = dpy.current_time  # ensure we have a valid timestamp

    data = [
        win.id,
        0,                # reserved
        coords,           # root x,y
        time,             # timestamp
        XdndActionCopy    # preferred action
    ]

    event = protocol.event.ClientMessage(
        window=wid,
        client_type=XdndPosition,
        data=(32, data)
    )
    target_win.send_event(event, event_mask=0)
    dpy.flush()
    #time.sleep(0.02)  # small delay to let target process + reply




def send_xdnd_drop(target_win):
    """send XdndDrop"""
    wid = target_win.id if hasattr(target_win, 'id') else target_win

    data = [
        win.id,
        0,
        X.CurrentTime,
        0, 0
    ]

    event = protocol.event.ClientMessage(
        window=wid,
        client_type=XdndDrop,
        data=(32, data)
    )
    target_win.send_event(event, event_mask=0)
    dpy.flush()


def handle_selection_request(event):
    """handle SelectionRequest - target wants our data"""
    if event.selection != dpy.intern_atom('XdndSelection'):
        return
    
    if event.target == text_uri_list:
        # send the file URI
        event.requestor.change_property(
            event.property,
            text_uri_list,
            8,  # 8-bit data
            file_uri
        )
        
        # send SelectionNotify
        notify = protocol.event.SelectionNotify(
            time=event.time,
            requestor=event.requestor,
            selection=event.selection,
            target=event.target,
            property=event.property
        )
    else:
        # unsupported target
        notify = protocol.event.SelectionNotify(
            time=event.time,
            requestor=event.requestor,
            selection=event.selection,
            target=event.target,
            property=0  # None
        )
    
    event.requestor.send_event(notify)
    dpy.flush()

print("click and hold in terminal to start drag (this is fake, just demonstrates the xdnd part)")
print("move mouse over a file manager and release")
input("press enter to start fake drag...")

# grab pointer
root.grab_pointer(
    True,
    X.PointerMotionMask | X.ButtonReleaseMask,
    X.GrabModeAsync,
    X.GrabModeAsync,
    0, 0,
    X.CurrentTime
)

# find initial target
target_win, x, y = get_window_at_pointer()
last_target = target_win
send_xdnd_enter(target_win)
send_xdnd_position(target_win, x, y)

print(f"dragging over window {target_win.id}")

# event loop - track motion and button release
dragging = True
while dragging:
    event = dpy.next_event()
    
    if event.type == X.MotionNotify:
        new_target, x, y = get_window_at_pointer()
        
        if new_target.id != last_target.id:
            # crossed window boundary, send new Enter
            send_xdnd_enter(new_target)
            last_target = new_target
            print(f"entered window {new_target.id}")
        
        send_xdnd_position(new_target, x, y)
    


# Instead of sending XdndDrop immediately on ButtonRelease:
    elif event.type == X.ButtonRelease:
        # First: send final XdndPosition (just in case)
        send_xdnd_position(last_target, x, y)

        # Now wait for XdndStatus (with timeout)
        status_received = False
        for _ in range(50):  # ~1 sec timeout (20ms * 50)
            try:
                event = dpy.next_event()  # block or poll
            except:
                break

            if event.type == X.ClientMessage and event.client_type == XdndStatus:
                #accept = bool(event.data.data[0] & 1)
                #if not accept:
                #    print("Drop rejected by target.")
                #    dragging = False
                #    break
                status_received = True
                break
            elif event.type == X.ClientMessage and event.client_type == XdndFinished:
                print("XdndFinished received early — ignoring")
            else:
                # Re-queue non-matching events? For simplicity, skip
                pass

        if not status_received:
            print("Warning: no XdndStatus received — dropping anyway (may fail)")


# Right before send_xdnd_drop()
        win.change_property(
            dpy.intern_atom('XdndSelection'),
            text_uri_list,
            8,
            file_uri
        )

        send_xdnd_drop(last_target)
        print(f"dropped on window {last_target.id}")
        dragging = False

    elif event.type == X.SelectionRequest:
        handle_selection_request(event)

    elif event.type == X.ClientMessage:
        if event.client_type == XdndStatus:
            # Parse XdndStatus
            # data[0]: source window
            # data[1]: flags (bit0 = accept, bit1 = rectangle, bit2-31 = accept action)
            #accept = bool(event.data.data[0] & 1)
            #print(f"XdndStatus: accept={accept}")
            #if not accept:
            #    print("Target rejected drag — aborting drop")
            #    dragging = False
            #    break
            pass
        elif event.client_type == XdndFinished:
            print("target confirmed drop finished")

    elif event.type == X.SelectionRequest:
        handle_selection_request(event)

dpy.ungrab_pointer(X.CurrentTime)
dpy.flush()
print("done")
