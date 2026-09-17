package com.zaksecurity.construction3dbuilder

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.zaksecurity.construction3dbuilder.construction.MaterialCatalog
import com.zaksecurity.construction3dbuilder.construction.WallFramer
import com.zaksecurity.construction3dbuilder.construction.WallOptions

private enum class EditorTab(val label: String, val short: String) {
    WORKSPACE("Workspace", "3D"),
    MATERIALS("Materials", "+"),
    BUILD("Build", "W"),
    PROJECT("Project", "P"),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Construction3DApp(editor: EditorViewModel = viewModel()) {
    var tabName by rememberSaveable { mutableStateOf(EditorTab.WORKSPACE.name) }
    val tab = EditorTab.valueOf(tabName)

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Construction 3D Builder", fontWeight = FontWeight.Bold)
                        Text("Native Kotlin foundation", style = MaterialTheme.typography.labelSmall)
                    }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                EditorTab.entries.forEach { item ->
                    NavigationBarItem(
                        selected = item == tab,
                        onClick = { tabName = item.name },
                        icon = { Text(item.short, fontWeight = FontWeight.Bold) },
                        label = { Text(item.label) },
                    )
                }
            }
        },
    ) { padding ->
        when (tab) {
            EditorTab.WORKSPACE -> WorkspaceScreen(editor, padding)
            EditorTab.MATERIALS -> MaterialsScreen(editor, padding)
            EditorTab.BUILD -> BuildScreen(editor, padding) { tabName = EditorTab.PROJECT.name }
            EditorTab.PROJECT -> ProjectScreen(editor, padding)
        }
    }
}

@Composable
private fun WorkspaceScreen(editor: EditorViewModel, padding: PaddingValues) {
    Column(
        modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Workspace", style = MaterialTheme.typography.headlineSmall)
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("3D renderer is the next milestone", fontWeight = FontWeight.Bold)
                Text("The native app is already using the final Kotlin project/material model. We will connect a renderer to these same parts instead of rebuilding the data layer later.")
                Text("Project currently contains ${editor.parts.size} parts.")
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { editor.addLumber("2x4") }) { Text("Add 8-ft 2×4") }
            OutlinedButton(onClick = { editor.generateWall(WallOptions()) }) { Text("Add sample wall") }
        }
    }
}

@Composable
private fun MaterialsScreen(editor: EditorViewModel, padding: PaddingValues) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("Dimensional lumber", style = MaterialTheme.typography.headlineSmall) }
        items(MaterialCatalog.lumber, key = { "lumber-${it.id}" }) { item ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(item.label, fontWeight = FontWeight.Bold)
                        Text("Actual ${item.actualThicknessIn} × ${item.actualWidthIn} in", style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = { editor.addLumber(item.id) }) { Text("Add") }
                }
            }
        }
        item {
            Spacer(Modifier.height(8.dp))
            Text("Sheet goods", style = MaterialTheme.typography.headlineSmall)
        }
        items(MaterialCatalog.sheets, key = { "sheet-${it.id}" }) { item ->
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.fillMaxWidth().padding(12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Column {
                        Text(item.label, fontWeight = FontWeight.Bold)
                        Text("48 × 96 in stock", style = MaterialTheme.typography.bodySmall)
                    }
                    Button(onClick = { editor.addSheet(item.id) }) { Text("Add") }
                }
            }
        }
    }
}

@Composable
private fun BuildScreen(editor: EditorViewModel, padding: PaddingValues, onGenerated: () -> Unit) {
    var length by rememberSaveable { mutableStateOf("96") }
    var leftHeight by rememberSaveable { mutableStateOf("96") }
    var rightHeight by rememberSaveable { mutableStateOf("96") }
    var spacing by rememberSaveable { mutableStateOf("16") }

    val options = remember(length, leftHeight, rightHeight, spacing) {
        WallOptions(
            lengthIn = length.toDoubleOrNull() ?: 96.0,
            leftHeightIn = leftHeight.toDoubleOrNull() ?: 96.0,
            rightHeightIn = rightHeight.toDoubleOrNull() ?: 96.0,
            spacingOnCenterIn = spacing.toDoubleOrNull() ?: 16.0,
        )
    }
    val preview = remember(options) { WallFramer.create(options) }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item { Text("Frame Wall", style = MaterialTheme.typography.headlineSmall) }
        item { NumberField("Wall length (in)", length) { length = it } }
        item { NumberField("Left height (in)", leftHeight) { leftHeight = it } }
        item { NumberField("Right height (in)", rightHeight) { rightHeight = it } }
        item { NumberField("Stud spacing O.C. (in)", spacing) { spacing = it } }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Text("Preview", fontWeight = FontWeight.Bold)
                    Text("${preview.pieces.size} individual members")
                    Text("${preview.pieces.count { it.role == "common-stud" }} common studs")
                    Text("Top: ${if (options.leftHeightIn == options.rightHeightIn) "level" else "sloped"}")
                }
            }
        }
        item {
            Button(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    editor.generateWall(options)
                    onGenerated()
                },
            ) { Text("Generate wall into project") }
        }
    }
}

@Composable
private fun NumberField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = Modifier.fillMaxWidth(),
        label = { Text(label) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        singleLine = true,
    )
}

@Composable
private fun ProjectScreen(editor: EditorViewModel, padding: PaddingValues) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(padding),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Project", style = MaterialTheme.typography.headlineSmall)
                    Text("${editor.parts.size} parts", style = MaterialTheme.typography.bodySmall)
                }
                OutlinedButton(onClick = editor::clearProject, enabled = editor.parts.isNotEmpty()) { Text("Clear") }
            }
        }
        items(editor.parts, key = { it.id }) { part ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text(part.label, fontWeight = FontWeight.Bold)
                    part.role?.let { Text(it.replace('-', ' '), style = MaterialTheme.typography.bodySmall) }
                    part.assemblyId?.let { Text("Assembly ${it.takeLast(8)}", style = MaterialTheme.typography.labelSmall) }
                }
            }
        }
    }
}
