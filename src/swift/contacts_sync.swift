import Contacts
import Foundation

func normalizePhone(_ raw: String) -> String {
    let digits = raw.filter { $0.isNumber }
    if digits.count == 11 && digits.hasPrefix("1") {
        return String(digits.dropFirst())
    }
    return digits
}

func humanLabel(_ raw: String) -> String {
    if raw.hasPrefix("_$!<") && raw.hasSuffix(">!$_") {
        return String(raw.dropFirst(4).dropLast(4))
    }
    return raw
}

let store = CNContactStore()

// Request access explicitly so macOS shows the TCC dialog with usage description
let sema = DispatchSemaphore(value: 0)
var accessGranted = false
store.requestAccess(for: .contacts) { granted, _ in
    accessGranted = granted
    sema.signal()
}
sema.wait()

guard accessGranted else {
    fputs("ERROR: not authorized\n", stderr)
    exit(1)
}

let keys = [
    CNContactIdentifierKey,
    CNContactGivenNameKey,
    CNContactFamilyNameKey,
    CNContactPhoneNumbersKey,
    CNContactEmailAddressesKey,
    CNContactOrganizationNameKey,
    CNContactNicknameKey
] as [CNKeyDescriptor]
let req = CNContactFetchRequest(keysToFetch: keys)
var lines: [String] = []
do {
    try store.enumerateContacts(with: req) { contact, _ in
        let phones = contact.phoneNumbers
        guard !phones.isEmpty else { return }
        let parts   = [contact.givenName, contact.familyName].filter { !$0.isEmpty }
        let name    = parts.joined(separator: " ")
        let email   = contact.emailAddresses.first?.value as String? ?? ""
        let company = contact.organizationName
        let nickname = contact.nickname
        var seenNorms = Set<String>()
        for labeled in phones {
            let phone = labeled.value.stringValue
            guard !phone.isEmpty else { continue }
            let norm = normalizePhone(phone)
            guard !norm.isEmpty else { continue }
            guard seenNorms.insert(norm).inserted else { continue }
            let label = humanLabel(labeled.label ?? "")
            let id = contact.identifier + "|" + phone
            lines.append("\(id)\t\(name)\t\(phone)\t\(label)\t\(email)\t\(company)\t\(nickname)")
        }
    }
    print(lines.joined(separator: "\n"))
} catch {
    fputs("ERROR: \(error.localizedDescription)\n", stderr)
    exit(1)
}
