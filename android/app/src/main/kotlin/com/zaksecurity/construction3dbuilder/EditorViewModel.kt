package com.zaksecurity.construction3dbuilder

import androidx.compose.runtime.mutableStateListOf
import androidx.lifecycle.ViewModel
import com.zaksecurity.construction3dbuilder.construction.MaterialCatalog
import com.zaksecurity.construction3dbuilder.construction.WallFramer
import com.zaksecurity.construction3dbuilder.construction.WallOptions
import com.zaksecurity.construction3dbuilder.model.ProjectPart
import com.zaksecurity.construction3dbuilder.model.StockFamily
import com.zaksecurity.construction3dbuilder.model.StockSpec

class EditorViewModel : ViewModel() {
    val parts = mutableStateListOf<ProjectPart>()

    fun addLumber(itemId: String, stockLengthIn: Double = 96.0) {
        val item = MaterialCatalog.lumber(itemId)
        val available = item.lengths.map { it.valueIn }
        val stockLength = available.firstOrNull { it >= stockLengthIn } ?: stockLengthIn
        val spec = StockSpec(
            family = StockFamily.LUMBER,
            itemId = itemId,
            stockLengthIn = stockLength,
            cutLengthIn = stockLength,
        )
        parts += ProjectPart(label = MaterialCatalog.resolve(spec).label, stock = spec)
    }

    fun addSheet(itemId: String) {
        val item = MaterialCatalog.sheet(itemId)
        val spec = StockSpec(
            family = StockFamily.SHEET,
            itemId = itemId,
            stockLengthIn = item.stockLengthIn,
            cutLengthIn = item.stockLengthIn,
            stockWidthIn = item.stockWidthIn,
            cutWidthIn = item.stockWidthIn,
            thicknessIn = item.thicknessesIn.first(),
        )
        parts += ProjectPart(label = MaterialCatalog.resolve(spec).label, stock = spec)
    }

    fun generateWall(options: WallOptions) {
        val plan = WallFramer.create(options)
        plan.pieces.forEach { member ->
            parts += ProjectPart(
                label = MaterialCatalog.resolve(member.spec).label,
                stock = member.spec,
                transform = member.transform,
                role = member.role,
                assemblyId = plan.assemblyId,
            )
        }
    }

    fun clearProject() = parts.clear()
}
