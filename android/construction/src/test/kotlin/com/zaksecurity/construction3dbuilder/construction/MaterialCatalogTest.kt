package com.zaksecurity.construction3dbuilder.construction

import kotlin.test.Test
import kotlin.test.assertEquals

class MaterialCatalogTest {
    @Test
    fun twoByFourUsesActualDimensions() {
        val item = MaterialCatalog.lumber("2x4")
        assertEquals(1.5, item.actualThicknessIn)
        assertEquals(3.5, item.actualWidthIn)
    }
}
