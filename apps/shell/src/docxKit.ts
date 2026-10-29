import type { Paragraph, Table } from 'docx'

export type DocxPart = Paragraph | Table

/** Small helpers for the Word downloads, so each export reads as a list of headings, notes and tables. The docx library is loaded here, only when a download is pressed. */
export async function docxKit() {
  const docx = await import('docx')
  const { Document, HeadingLevel, Packer, TableCell, TableRow, TextRun, WidthType } = docx
  const para = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) => new docx.Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] })
  const heading = (text: string, level: 'title' | 1 | 2) => new docx.Paragraph({ heading: level === 'title' ? HeadingLevel.TITLE : level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun(text)] })
  const table = (head: string[] | null, rows: string[][]) => new docx.Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      ...(head ? [new TableRow({ tableHeader: true, children: head.map((h) => new TableCell({ children: [para(h, { bold: true })] })) })] : []),
      ...rows.map((r) => new TableRow({ children: r.map((c) => new TableCell({ children: [para(c)] })) })),
    ],
  })
  /** Packs the parts into a .docx and saves it as `<name>.docx`. */
  const save = async (name: string, children: DocxPart[]) => {
    const blob = await Packer.toBlob(new Document({ sections: [{ children }] }))
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'download'}.docx`
    a.click()
    URL.revokeObjectURL(url)
  }
  return { para, heading, table, save }
}
