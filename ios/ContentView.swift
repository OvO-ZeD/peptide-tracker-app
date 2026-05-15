import SwiftUI

struct PeptideTab: Identifiable, Codable {
    var id: UUID
    var name: String
    var peptideName: String
    var doseMg: Double
    var frequencyPerWeek: Int
    var logsByWeek: [String: [Date]]
}

struct ContentView: View {
    @State private var tabs: [PeptideTab] = []
    @State private var selectedTabId: UUID?
    @State private var newTabName = ""
    @State private var renameTabName = ""
    @State private var calcDoseMg = ""
    @State private var calcVialMg = ""
    @State private var calcBacMl = ""
    @State private var calcResult = ""

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 14) {
                        HStack {
                            TextField("New peptide tab", text: $newTabName)
                            Button("Add") { addTab() }
                        }
                        .textFieldStyle(.roundedBorder)

                        HStack {
                            TextField("Rename selected tab", text: $renameTabName)
                            Button("Rename") { renameTab() }
                        }
                        .textFieldStyle(.roundedBorder)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack {
                                ForEach(tabs) { tab in
                                    Button(tab.name) { selectedTabId = tab.id }
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 8)
                                        .background(selectedTabId == tab.id ? Color.blue : Color.gray.opacity(0.3))
                                        .cornerRadius(10)
                                }
                            }
                        }

                        if let index = selectedIndex {
                            VStack(alignment: .leading, spacing: 8) {
                                TextField("Peptide name", text: $tabs[index].peptideName)
                                TextField("Dose mg", value: $tabs[index].doseMg, format: .number)
                                TextField("Frequency/week", value: $tabs[index].frequencyPerWeek, format: .number)
                                Button("Save") { saveState() }
                                Text("Weekly total: \((tabs[index].doseMg * Double(tabs[index].frequencyPerWeek)), specifier: "%.2f") mg")
                                Button("Log Dose Now") { logDoseNow() }
                                Button("Clear This Week") { clearThisWeek() }
                                Text("This week administrations: \(thisWeekLogs.count)")
                            }
                            .textFieldStyle(.roundedBorder)
                            .padding()
                            .background(Color.white.opacity(0.08))
                            .cornerRadius(12)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Vial Unit Calculator")
                            TextField("Dose mg", text: $calcDoseMg)
                            TextField("Vial mg", text: $calcVialMg)
                            TextField("Bac water ml", text: $calcBacMl)
                            Button("Calculate") { calculateUnits() }
                            Text(calcResult)
                        }
                        .textFieldStyle(.roundedBorder)
                        .padding()
                        .background(Color.white.opacity(0.08))
                        .cornerRadius(12)
                    }
                    .padding()
                    .foregroundColor(.white)
                }
            }
            .navigationTitle("Peptide Tracker")
            .onAppear { loadState() }
        }
    }

    var selectedIndex: Int? {
        tabs.firstIndex { $0.id == selectedTabId }
    }

    var thisWeekLogs: [Date] {
        guard let index = selectedIndex else { return [] }
        return tabs[index].logsByWeek[weekKey()] ?? []
    }

    func addTab() {
        let name = newTabName.trimmingCharacters(in: .whitespacesAndNewlines)
        let tab = PeptideTab(id: UUID(), name: name.isEmpty ? "Peptide \(tabs.count + 1)" : name, peptideName: "", doseMg: 0, frequencyPerWeek: 1, logsByWeek: [:])
        tabs.append(tab)
        selectedTabId = tab.id
        newTabName = ""
        saveState()
    }

    func renameTab() {
        guard let index = selectedIndex else { return }
        let name = renameTabName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !name.isEmpty {
            tabs[index].name = name
            renameTabName = ""
            saveState()
        }
    }

    func calculateUnits() {
        guard let dose = Double(calcDoseMg), let vial = Double(calcVialMg), let bac = Double(calcBacMl), dose > 0, vial > 0, bac > 0 else {
            calcResult = "Enter valid values."
            return
        }
        let concentration = vial / bac
        let ml = dose / concentration
        let units = ml * 100
        calcResult = "Inject \(String(format: "%.1f", units)) units (\(String(format: "%.2f", ml)) ml)."
    }

    func logDoseNow() {
        guard let index = selectedIndex else { return }
        let key = weekKey()
        if tabs[index].logsByWeek[key] == nil {
            tabs[index].logsByWeek[key] = []
        }
        tabs[index].logsByWeek[key]?.append(Date())
        saveState()
    }

    func clearThisWeek() {
        guard let index = selectedIndex else { return }
        tabs[index].logsByWeek[weekKey()] = []
        saveState()
    }

    func weekKey() -> String {
        let now = Date()
        let yearForWeek = Calendar.current.component(.yearForWeekOfYear, from: now)
        let week = Calendar.current.component(.weekOfYear, from: now)
        return "\(yearForWeek)-W\(String(format: "%02d", week))"
    }

    func saveState() {
        if let data = try? JSONEncoder().encode(tabs) {
            UserDefaults.standard.set(data, forKey: "tracker_tabs")
        }
        if let id = selectedTabId {
            UserDefaults.standard.set(id.uuidString, forKey: "tracker_selected_tab")
        }
    }

    func loadState() {
        if let data = UserDefaults.standard.data(forKey: "tracker_tabs"), let decoded = try? JSONDecoder().decode([PeptideTab].self, from: data) {
            tabs = decoded
        }
        if tabs.isEmpty {
            let tab = PeptideTab(id: UUID(), name: "Peptide 1", peptideName: "", doseMg: 0, frequencyPerWeek: 1, logsByWeek: [:])
            tabs = [tab]
            selectedTabId = tab.id
            saveState()
            return
        }
        if let raw = UserDefaults.standard.string(forKey: "tracker_selected_tab"), let uuid = UUID(uuidString: raw), tabs.contains(where: { $0.id == uuid }) {
            selectedTabId = uuid
        } else {
            selectedTabId = tabs[0].id
        }
    }
}