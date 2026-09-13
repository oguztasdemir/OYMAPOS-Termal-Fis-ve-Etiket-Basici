# -*- coding: utf-8 -*-
"""
🎮 API Controller
Tüm alt denetleyici (controller) modüllerini toplayıp tek bir router altında birleştiren ana merkez.
"""
from fastapi import APIRouter

from backend.controllers.network_controller import router as network_router
from backend.controllers.printer_controller import router as printer_router
from backend.controllers.product_controller import router as product_router
from backend.controllers.print_controller import router as print_router
from backend.controllers.vegawin_controller import router as vegawin_router
from backend.controllers.template_controller import router as template_router
from backend.controllers.system_controller import router as system_router
from backend.controllers.scanner_controller import router as scanner_router
from backend.controllers.report_controller import router as report_router

router = APIRouter()

# Alt Modülleri Ana Router'a Ekle
router.include_router(network_router)
router.include_router(printer_router)
router.include_router(product_router)
router.include_router(print_router)
router.include_router(vegawin_router)
router.include_router(template_router)
router.include_router(system_router)
router.include_router(scanner_router)
router.include_router(report_router)
