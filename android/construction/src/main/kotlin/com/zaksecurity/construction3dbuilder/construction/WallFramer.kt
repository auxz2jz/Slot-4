package com.zaksecurity.construction3dbuilder.construction

import com.zaksecurity.construction3dbuilder.model.CutOperation
import com.zaksecurity.construction3dbuilder.model.End
import com.zaksecurity.construction3dbuilder.model.StockFamily
import com.zaksecurity.construction3dbuilder.model.StockSpec
import com.zaksecurity.construction3dbuilder.model.Transform3D
import com.zaksecurity.construction3dbuilder.model.Vec3
import java.util.UUID
import kotlin.math.atan2
import kotlin.math.hypot


data class WallOpening(
    val type: Type,
    val offsetIn: Double,
    val widthIn: Double,
    val heightIn: Double,
    val sillHeightIn: Double = 36.0,
    val headerItemId: String = "2x8",
) {
    enum class Type { DOOR, WINDOW }
}

data class WallOptions(
    val lengthIn: Double = 96.0,
    val leftHeightIn: Double = 96.0,
    val rightHeightIn: Double = 96.0,
    val spacingOnCenterIn: Double = 16.0,
    val studItemId: String = "2x4",
    val doubleTopPlate: Boolean = true,
    val leftThreeStudCorner: Boolean = true,
    val rightThreeStudCorner: Boolean = true,
    val opening: WallOpening? = null,
)

data class WallPiece(
    val role: String,
    val spec: StockSpec,
    val transform: Transform3D,
)

data class WallPlan(
    val assemblyId: String,
    val options: WallOptions,
    val pieces: List<WallPiece>,
)

object WallFramer {
    private const val MAX_STANDARD_STOCK_IN = 192.0

    fun create(options: WallOptions = WallOptions()): WallPlan {
        val length = options.lengthIn.coerceAtLeast(12.0)
        val leftHeight = options.leftHeightIn.coerceAtLeast(12.0)
        val rightHeight = options.rightHeightIn.coerceAtLeast(12.0)
        val spacing = options.spacingOnCenterIn.coerceAtLeast(4.0)
        val stud = MaterialCatalog.lumber(options.studItemId)
        val studThickness = stud.actualThicknessIn
        val wallDepth = stud.actualWidthIn
        val topPlateCount = if (options.doubleTopPlate) 2 else 1
        val slopeAngle = Math.toDegrees(atan2(rightHeight - leftHeight, length))
        val slopedTopLength = hypot(length, rightHeight - leftHeight)
        val pieces = mutableListOf<WallPiece>()
        val assemblyId = "wall-${UUID.randomUUID()}"

        splitLength(length).forEach { segment ->
            pieces += piece(
                role = "bottom-plate",
                spec = stockSpec(options.studItemId, segment.length),
                position = Vec3(-length / 2 + segment.start + segment.length / 2, 0.0, studThickness / 2),
            )
        }

        for (layer in 0 until topPlateCount) {
            val verticalOffset = studThickness / 2 + layer * studThickness
            splitLength(slopedTopLength).forEach { segment ->
                val midpointRatio = (segment.start + segment.length / 2) / slopedTopLength
                val x = -length / 2 + length * midpointRatio
                val z = leftHeight + (rightHeight - leftHeight) * midpointRatio - verticalOffset
                pieces += piece(
                    role = if (layer == 0) "top-plate" else "top-plate-2",
                    spec = stockSpec(options.studItemId, segment.length),
                    position = Vec3(x, 0.0, z),
                    rotation = Vec3(0.0, -slopeAngle, 0.0),
                )
            }
        }

        val opening = options.opening
        var blockedStart = Double.POSITIVE_INFINITY
        var blockedEnd = Double.NEGATIVE_INFINITY
        if (opening != null) {
            val openingLeft = maxOf(studThickness * 3, opening.offsetIn)
            val openingRight = minOf(length - studThickness * 3, openingLeft + maxOf(12.0, opening.widthIn))
            blockedStart = openingLeft - studThickness * 2
            blockedEnd = openingRight + studThickness * 2
        }

        val centers = commonStudCenters(length, spacing, studThickness)
            .filter { it < blockedStart || it > blockedEnd }
            .toMutableList()

        if (options.leftThreeStudCorner) {
            centers += studThickness * 1.5
            centers += studThickness * 2.5
        }
        if (options.rightThreeStudCorner) {
            centers += length - studThickness * 1.5
            centers += length - studThickness * 2.5
        }

        fun addVerticalStud(role: String, xFromLeft: Double, bottomZ: Double = studThickness, topZ: Double? = null) {
            val wallTop = slopeHeight(leftHeight, rightHeight, length, xFromLeft)
            val actualTop = topZ ?: (wallTop - topPlateCount * studThickness)
            val cutLength = maxOf(studThickness, actualTop - bottomZ)
            val operations = if (kotlin.math.abs(slopeAngle) > 0.001 && topZ == null) {
                listOf(CutOperation.EndCut(End.B, bevelDegrees = -slopeAngle))
            } else emptyList()
            pieces += piece(
                role = role,
                spec = stockSpec(options.studItemId, cutLength, operations),
                position = Vec3(-length / 2 + xFromLeft, 0.0, bottomZ + cutLength / 2),
                rotation = Vec3(0.0, -90.0, 0.0),
            )
        }

        uniquePositions(centers).forEach { addVerticalStud("common-stud", it) }

        if (opening != null) {
            val openingLeft = maxOf(studThickness * 3, opening.offsetIn)
            val openingRight = minOf(length - studThickness * 3, openingLeft + maxOf(12.0, opening.widthIn))
            val openingWidth = openingRight - openingLeft
            val roughHeight = maxOf(24.0, opening.heightIn)
            val sillHeight = if (opening.type == WallOpening.Type.WINDOW) maxOf(studThickness * 2, opening.sillHeightIn) else studThickness
            val header = MaterialCatalog.lumber(opening.headerItemId)
            val headerBottom = minOf(
                slopeHeight(leftHeight, rightHeight, length, (openingLeft + openingRight) / 2) - topPlateCount * studThickness - header.actualWidthIn,
                if (opening.type == WallOpening.Type.DOOR) roughHeight else sillHeight + roughHeight,
            )

            val leftJack = openingLeft - studThickness / 2
            val rightJack = openingRight + studThickness / 2
            val leftKing = openingLeft - studThickness * 1.5
            val rightKing = openingRight + studThickness * 1.5

            addVerticalStud("king-stud", leftKing)
            addVerticalStud("king-stud", rightKing)
            addVerticalStud("jack-stud", leftJack, studThickness, headerBottom)
            addVerticalStud("jack-stud", rightJack, studThickness, headerBottom)

            val headerLength = openingWidth + studThickness * 2
            val headerCenterX = -length / 2 + (openingLeft + openingRight) / 2
            val headerCenterZ = headerBottom + header.actualWidthIn / 2
            val headerYOffset = maxOf(0.0, wallDepth / 2 - header.actualThicknessIn / 2)
            pieces += piece(
                "header",
                stockSpec(opening.headerItemId, headerLength),
                Vec3(headerCenterX, -headerYOffset, headerCenterZ),
                Vec3(90.0, 0.0, 0.0),
            )
            if (headerYOffset > 0.01) {
                pieces += piece(
                    "header",
                    stockSpec(opening.headerItemId, headerLength),
                    Vec3(headerCenterX, headerYOffset, headerCenterZ),
                    Vec3(90.0, 0.0, 0.0),
                )
            }

            if (opening.type == WallOpening.Type.WINDOW) {
                pieces += piece(
                    "window-sill",
                    stockSpec(options.studItemId, openingWidth),
                    Vec3(headerCenterX, 0.0, sillHeight),
                )
                commonStudCenters(length, spacing, studThickness)
                    .filter { it > openingLeft && it < openingRight }
                    .forEach { addVerticalStud("cripple-below", it, studThickness, sillHeight - studThickness / 2) }
            }

            val headerTop = headerBottom + header.actualWidthIn
            commonStudCenters(length, spacing, studThickness)
                .filter { it > openingLeft && it < openingRight }
                .forEach { addVerticalStud("cripple-above", it, headerTop) }
        }

        return WallPlan(assemblyId, options.copy(lengthIn = length, leftHeightIn = leftHeight, rightHeightIn = rightHeight, spacingOnCenterIn = spacing), pieces)
    }

    private data class Segment(val start: Double, val length: Double)

    private fun splitLength(total: Double): List<Segment> {
        val result = mutableListOf<Segment>()
        var cursor = 0.0
        while (cursor < total - 0.001) {
            val length = minOf(MAX_STANDARD_STOCK_IN, total - cursor)
            result += Segment(cursor, length)
            cursor += length
        }
        return result
    }

    private fun chooseStockLength(itemId: String, required: Double): Double {
        val candidates = MaterialCatalog.lumber(itemId).lengths.map { it.valueIn }.filter { it >= required }.sorted()
        return candidates.firstOrNull() ?: required
    }

    private fun stockSpec(itemId: String, cutLength: Double, operations: List<CutOperation> = emptyList()) = StockSpec(
        family = StockFamily.LUMBER,
        itemId = itemId,
        stockLengthIn = chooseStockLength(itemId, cutLength),
        cutLengthIn = cutLength,
        operations = operations,
    )

    private fun piece(role: String, spec: StockSpec, position: Vec3, rotation: Vec3 = Vec3()) = WallPiece(
        role = role,
        spec = spec,
        transform = Transform3D(position = position, rotationDegrees = rotation),
    )

    private fun commonStudCenters(length: Double, spacing: Double, studThickness: Double): List<Double> {
        val centers = mutableListOf(studThickness / 2)
        var x = spacing
        while (x < length - studThickness / 2) {
            centers += x
            x += spacing
        }
        centers += length - studThickness / 2
        return uniquePositions(centers)
    }

    private fun uniquePositions(values: List<Double>, tolerance: Double = 0.01): List<Double> = values.sorted().filterIndexed { index, value ->
        index == 0 || kotlin.math.abs(value - values.sorted()[index - 1]) > tolerance
    }

    private fun slopeHeight(left: Double, right: Double, length: Double, xFromLeft: Double): Double =
        if (length <= 0) left else left + (right - left) * (xFromLeft / length)
}
