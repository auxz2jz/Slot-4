package com.zaksecurity.construction3dbuilder.construction

import com.zaksecurity.construction3dbuilder.model.StockFamily
import com.zaksecurity.construction3dbuilder.model.StockSpec
import kotlin.math.abs
import kotlin.math.floor

data class StockLength(val valueIn: Double, val label: String)

data class LumberDefinition(
    val id: String,
    val label: String,
    val actualThicknessIn: Double,
    val actualWidthIn: Double,
    val lengths: List<StockLength>,
)

data class SheetDefinition(
    val id: String,
    val label: String,
    val stockLengthIn: Double = 96.0,
    val stockWidthIn: Double = 48.0,
    val thicknessesIn: List<Double>,
)

data class ResolvedStockPart(
    val label: String,
    val lengthIn: Double,
    val widthIn: Double,
    val thicknessIn: Double,
    val stock: StockSpec,
)

object MaterialCatalog {
    val stockLengths = listOf(
        StockLength(96.0, "8 ft (96 in)"),
        StockLength(120.0, "10 ft (120 in)"),
        StockLength(144.0, "12 ft (144 in)"),
        StockLength(168.0, "14 ft (168 in)"),
        StockLength(192.0, "16 ft (192 in)"),
    )

    private val stud8 = StockLength(92.625, "Precut 8-ft stud (92 5/8 in)")
    private val stud9 = StockLength(104.625, "Precut 9-ft stud (104 5/8 in)")

    val lumber = listOf(
        LumberDefinition("1x2", "1 × 2", 0.75, 1.5, stockLengths),
        LumberDefinition("1x3", "1 × 3", 0.75, 2.5, stockLengths),
        LumberDefinition("1x4", "1 × 4", 0.75, 3.5, stockLengths),
        LumberDefinition("1x6", "1 × 6", 0.75, 5.5, stockLengths),
        LumberDefinition("1x8", "1 × 8", 0.75, 7.25, stockLengths),
        LumberDefinition("1x10", "1 × 10", 0.75, 9.25, stockLengths),
        LumberDefinition("1x12", "1 × 12", 0.75, 11.25, stockLengths),
        LumberDefinition("2x2", "2 × 2", 1.5, 1.5, stockLengths),
        LumberDefinition("2x3", "2 × 3", 1.5, 2.5, stockLengths),
        LumberDefinition("2x4", "2 × 4", 1.5, 3.5, listOf(stud8, stud9) + stockLengths),
        LumberDefinition("2x6", "2 × 6", 1.5, 5.5, listOf(stud8, stud9) + stockLengths),
        LumberDefinition("2x8", "2 × 8", 1.5, 7.25, stockLengths),
        LumberDefinition("2x10", "2 × 10", 1.5, 9.25, stockLengths),
        LumberDefinition("2x12", "2 × 12", 1.5, 11.25, stockLengths),
        LumberDefinition("4x4", "4 × 4", 3.5, 3.5, stockLengths),
        LumberDefinition("4x6", "4 × 6", 3.5, 5.5, stockLengths),
        LumberDefinition("6x6", "6 × 6", 5.5, 5.5, stockLengths),
    )

    val sheets = listOf(
        SheetDefinition("plywood", "Plywood", thicknessesIn = listOf(0.25, 0.375, 0.5, 0.625, 0.75)),
        SheetDefinition("osb", "OSB", thicknessesIn = listOf(0.4375, 0.5, 0.59375, 0.625, 0.75)),
        SheetDefinition("mdf", "MDF", thicknessesIn = listOf(0.25, 0.5, 0.75)),
        SheetDefinition("particleboard", "Particleboard", thicknessesIn = listOf(0.5, 0.625, 0.75)),
        SheetDefinition("drywall", "Drywall", thicknessesIn = listOf(0.25, 0.375, 0.5, 0.625)),
        SheetDefinition("cement-board", "Cement backer board", thicknessesIn = listOf(0.25, 0.5)),
        SheetDefinition("foam-board", "Rigid foam board", thicknessesIn = listOf(0.5, 1.0, 1.5, 2.0)),
    )

    fun lumber(id: String): LumberDefinition = lumber.firstOrNull { it.id == id } ?: lumber.first { it.id == "2x4" }
    fun sheet(id: String): SheetDefinition = sheets.firstOrNull { it.id == id } ?: sheets.first()

    fun resolve(spec: StockSpec): ResolvedStockPart = when (spec.family) {
        StockFamily.LUMBER -> {
            val item = lumber(spec.itemId)
            val cutLength = spec.cutLengthIn.coerceAtLeast(0.125)
            ResolvedStockPart(
                label = "${item.label} — ${formatInches(cutLength)} long",
                lengthIn = cutLength,
                widthIn = item.actualWidthIn,
                thicknessIn = item.actualThicknessIn,
                stock = spec,
            )
        }
        StockFamily.SHEET -> {
            val item = sheet(spec.itemId)
            val length = spec.cutLengthIn.coerceIn(0.125, item.stockLengthIn)
            val width = (spec.cutWidthIn ?: item.stockWidthIn).coerceIn(0.125, item.stockWidthIn)
            val thickness = spec.thicknessIn ?: item.thicknessesIn.first()
            ResolvedStockPart(
                label = "${item.label} — ${formatInches(length)} × ${formatInches(width)} × ${formatInches(thickness)}",
                lengthIn = length,
                widthIn = width,
                thicknessIn = thickness,
                stock = spec,
            )
        }
    }

    fun formatInches(value: Double): String {
        val fractions = listOf(
            0.125 to "1/8", 0.25 to "1/4", 0.375 to "3/8", 0.4375 to "7/16",
            0.5 to "1/2", 0.59375 to "19/32", 0.625 to "5/8", 0.75 to "3/4",
        )
        val whole = floor(value).toInt()
        val fraction = value - whole
        val match = fractions.firstOrNull { abs(it.first - fraction) < 0.0001 }?.second
        return when {
            whole > 0 && match != null -> "$whole $match in"
            match != null -> "$match in"
            else -> "${"%.3f".format(value).trimEnd('0').trimEnd('.')} in"
        }
    }
}
