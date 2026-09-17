package com.zaksecurity.construction3dbuilder.model

import java.util.UUID

enum class StockFamily { LUMBER, SHEET }
enum class End { A, B }
enum class CutFace { TOP, BOTTOM, FRONT, BACK }

data class Vec3(
    val x: Double = 0.0,
    val y: Double = 0.0,
    val z: Double = 0.0,
)

data class Transform3D(
    val position: Vec3 = Vec3(),
    val rotationDegrees: Vec3 = Vec3(),
)

sealed interface CutOperation {
    data class EndCut(
        val end: End,
        val miterDegrees: Double = 0.0,
        val bevelDegrees: Double = 0.0,
    ) : CutOperation

    data class Notch(
        val face: CutFace,
        val startFromEndAIn: Double,
        val lengthIn: Double,
        val acrossFaceOffsetIn: Double,
        val acrossFaceWidthIn: Double,
        val depthIn: Double,
    ) : CutOperation

    data class TrimPlane(
        val normal: Vec3,
        val constant: Double,
        val keepSign: Int,
    ) : CutOperation
}

data class StockSpec(
    val family: StockFamily,
    val itemId: String,
    val stockLengthIn: Double,
    val cutLengthIn: Double,
    val stockWidthIn: Double? = null,
    val cutWidthIn: Double? = null,
    val thicknessIn: Double? = null,
    val operations: List<CutOperation> = emptyList(),
)

data class ProjectPart(
    val id: String = UUID.randomUUID().toString(),
    val label: String,
    val stock: StockSpec? = null,
    val transform: Transform3D = Transform3D(),
    val role: String? = null,
    val assemblyId: String? = null,
)

data class ConstructionProject(
    val schemaVersion: Int = 1,
    val name: String = "Untitled Project",
    val parts: List<ProjectPart> = emptyList(),
)
