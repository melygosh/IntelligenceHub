import { useParams } from 'react-router-dom';

export default function ArticleDetail() {
  const { id } = useParams<{ id: string }>();
  return <h1 className="text-xl font-semibold">Article {id}</h1>;
}
