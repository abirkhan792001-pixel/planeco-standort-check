export const metadata = { title: 'Datenschutzhinweise – Standort-Check' };

export default function Datenschutz() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;
  return (
    <main className="prose mx-auto max-w-2xl px-4 py-8 text-stone-800">
      <h1 className="text-2xl font-bold">Datenschutzhinweise</h1>
      <p><strong>Hinweis:</strong> Diese Seite ist ein Prototyp im Rahmen einer Case Study und keine offizielle Seite der Planeco Building GmbH.</p>
      <h2 className="mt-6 font-semibold">Verantwortlich</h2>
      <p>Abir Khan (Case-Study-Prototyp){contact ? <> · Kontakt: <a href={`mailto:${contact}`}>{contact}</a></> : null}</p>
      <h2 className="mt-6 font-semibold">Zweck und Rechtsgrundlage</h2>
      <p>Wir verarbeiten Ihre Angaben (Name, Kontaktdaten, Adresse des Grundstücks, optionale Angaben) ausschließlich, um Ihre Anfrage zum Standort-Check zu bearbeiten und Sie zu kontaktieren (Art. 6 Abs. 1 lit. b DSGVO). Zur Auswertung unserer Kampagnen speichern wir die Kampagnenparameter der aufgerufenen Adresse (z. B. utm_source) sowie den Gerätetyp; es werden keine Cookies gesetzt und keine Tracking-Pixel verwendet.</p>
      <h2 className="mt-6 font-semibold">Empfänger</h2>
      <ul>
        <li>Vercel Inc. (Hosting)</li>
        <li>Supabase (Datenbank, Serverstandort Frankfurt am Main)</li>
        <li>Brevo / Sendinblue SAS (Versand der Bestätigungs-E-Mail)</li>
        <li>OpenStreetMap Foundation (Nominatim) und OpenPLZ API (Zuordnung der Adresse zu Gemeinde, Kreis und Bundesland)</li>
      </ul>
      <h2 className="mt-6 font-semibold">Speicherdauer</h2>
      <p>Die Daten werden nach Abschluss des Bewerbungsverfahrens, für das dieser Prototyp erstellt wurde, gelöscht.</p>
      <h2 className="mt-6 font-semibold">Ihre Rechte</h2>
      <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch sowie das Recht auf Beschwerde bei einer Datenschutzaufsichtsbehörde.</p>
    </main>
  );
}
