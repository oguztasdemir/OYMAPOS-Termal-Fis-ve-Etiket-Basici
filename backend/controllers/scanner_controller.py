# -*- coding: utf-8 -*-
"""
📷 Scanner Controller (OYMAPOS 1-1 Birebir)
Canlı kamera karesinden gelişmiş barkod çözme (CLAHE, parlama filtresi, eğri yüzey de-warp, PyZBar + OpenCV)
"""
import base64
import numpy as np
import cv2
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.utils.advanced_barcode_decoder import decode_advanced_barcode, validate_barcode_checksum

router = APIRouter(prefix="/api/scanner", tags=["Scanner"])

@router.post("/decode-frame")
async def decode_frame(request: Request):
    """
    Kamera karesinden gelişmiş parlama, yuvarlak/bükük yüzey ve hibrit barkod çözümü yapar.
    """
    try:
        body = await request.json()
        image_data = body.get("image")
        if not image_data:
            return JSONResponse({"status": "not_found", "barcode": None})

        if "," in image_data:
            image_data = image_data.split(",")[1]

        raw_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(raw_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse({"status": "not_found", "barcode": None})

        glare_mode = bool(body.get("glare_mode", False))
        barcode_result = decode_advanced_barcode(img, aggressive_mode=True)

        if barcode_result:
            clean_bc = str(barcode_result).strip()
            if validate_barcode_checksum(clean_bc):
                return JSONResponse({
                    "status": "success",
                    "barcode": clean_bc
                })

        return JSONResponse({"status": "not_found", "barcode": None})
    except Exception as e:
        return JSONResponse({"status": "not_found", "error": str(e)}, status_code=200)
