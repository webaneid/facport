// § Fase 150, ADR-0038, architecture-konverter.md — pola "generate file di browser lalu download" PERTAMA di
// project ini (grep sebelumnya: 0 hasil `createObjectURL`/`Blob`/`download=` di luar sini). Dipakai Konverter
// untuk memicu download file XML hasil konversi TANPA round-trip ke server (100% client-side, § keputusan user).

/** Trigger download 1 file teks di browser via Blob + `<a download>` sintetis. `URL.revokeObjectURL` dipanggil
 * segera setelah klik dipicu (bukan ditunda) — objek Blob-nya sudah tidak dibutuhkan lagi begitu browser mulai
 * proses download. */
export function downloadTextFile(fileName: string, content: string, mimeType = "application/xml"): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
