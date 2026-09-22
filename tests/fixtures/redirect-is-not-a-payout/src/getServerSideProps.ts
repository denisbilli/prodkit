type RedirectResult = { redirect: { permanent: boolean; destination: string } };

export async function getServerSideProps(ctx: { req: { url: string } }): Promise<RedirectResult> {
  return { redirect: { permanent: false, destination: '/login' } };
}
