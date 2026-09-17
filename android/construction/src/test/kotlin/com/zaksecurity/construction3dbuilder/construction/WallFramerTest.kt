package com.zaksecurity.construction3dbuilder.construction

import kotlin.test.Test
import kotlin.test.assertTrue

class WallFramerTest {
    @Test
    fun wallWithDoorCreatesRequiredMembers() {
        val plan = WallFramer.create(
            WallOptions(
                lengthIn = 120.0,
                leftHeightIn = 96.0,
                rightHeightIn = 108.0,
                opening = WallOpening(WallOpening.Type.DOOR, 36.0, 36.0, 82.5),
            ),
        )
        val roles = plan.pieces.map { it.role }.toSet()
        listOf("bottom-plate", "top-plate", "common-stud", "king-stud", "jack-stud", "header").forEach {
            assertTrue(it in roles, "Missing role: $it")
        }
    }

    @Test
    fun longTopPlatesAreSplitIntoStandardLengthPieces() {
        val plan = WallFramer.create(WallOptions(lengthIn = 300.0))
        val topPlates = plan.pieces.filter { it.role.startsWith("top-plate") }
        assertTrue(topPlates.isNotEmpty())
        assertTrue(topPlates.all { it.spec.cutLengthIn <= 192.0 })
    }
}
