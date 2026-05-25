import { useParams } from 'react-router-dom';

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();
  return <h1 className="text-xl font-semibold">Entity {id}</h1>;
}
