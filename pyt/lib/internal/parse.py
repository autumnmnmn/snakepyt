
def lsnap(s: str, delimiter=' '):
    parts = s.lstrip().split(delimiter, 1)
    return (parts[0].rstrip(), parts[1].lstrip() if len(parts) > 1 else "")

