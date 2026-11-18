import { SectionPage, sectionMetadata } from '../../../src/catalog/SectionPage';
import { one, type SearchParams } from '../../../src/catalog/search-params';
import { sectionOf } from '../../../src/catalog/sections';

const section = sectionOf('premium');

export const metadata = sectionMetadata(section);

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <SectionPage section={section} cursor={one((await searchParams).cursor)} />;
}
