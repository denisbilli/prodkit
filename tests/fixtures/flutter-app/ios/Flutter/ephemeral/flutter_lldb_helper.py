import lldb


def handle_new_rx_page(frame, bp_loc, extra_args, intern_dict):
    """Intercept NOTIFY_DEBUGGER_ABOUT_RX_PAGE and touch the pages."""
    base = frame.register["x0"].GetValueAsAddress()
    page_len = frame.register["x1"].GetValueAsUnsigned()
    frame.thread.process.WriteMemory(base, b"\0" * page_len, lldb.SBError())
