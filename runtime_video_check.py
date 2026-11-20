"""Verify the installed CPU video path before marking Remote Play ready."""
from base64 import b64decode
from io import BytesIO

# A single original 32x32 red H.264 frame, Annex B, with its parameter sets.
RED_FRAME = "AAAAAWdCwAraJbARAAADAAEAAAMAMo8SJqAAAAABaM4PyAAAAWWIhDoRigACGPHAAED2OAAIeUnXXg=="


def check_video():
    import av
    from PIL import Image

    decoder = av.CodecContext.create("h264", "r")
    frames = decoder.decode(av.Packet(b64decode(RED_FRAME))) + decoder.decode(None)
    if len(frames) != 1:
        raise RuntimeError("Expected one decoded frame")
    output = BytesIO()
    frames[0].to_image().save(output, format="JPEG", quality=78)
    output.seek(0)
    with Image.open(output) as image:
        if image.size != (32, 32):
            raise RuntimeError("Unexpected decoded dimensions")
        red, green, blue = image.convert("RGB").getpixel((16, 16))
        if red < 200 or green > 50 or blue > 50:
            raise RuntimeError("Unexpected decoded color")


if __name__ == "__main__":
    check_video()
