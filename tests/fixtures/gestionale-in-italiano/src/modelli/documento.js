async function elencaDocumenti(aziendaId) {
  return prisma.documento.findMany({ where: { aziendaId } })
}

async function trovaDocumento(id, aziendaId) {
  const documento = await prisma.documento.findFirst({ where: { id, aziendaId } })
  if (!documento) throw new Error('non trovato')
  return documento
}

module.exports = { elencaDocumenti, trovaDocumento }
