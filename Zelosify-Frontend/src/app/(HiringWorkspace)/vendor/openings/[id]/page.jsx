import OpeningDetail from '@/components/hiring/OpeningDetail';
export default async function Page({params}){const {id}=await params;return <OpeningDetail id={id}/>;}
