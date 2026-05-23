export interface Movie {
  tmdb_id: number;
  imdb_id?: string | null;
  title: string;
  release_date?: string | null;
  release_year?: number | null;
  genres?: string | null;
  overview?: string | null;
  poster_url?: string | null;
  tmdb_rating?: number | null;
  tmdb_votes?: number | null;
  imdb_rating?: number | null;
  imdb_votes?: number | null;
  rt_score?: number | null;
  metacritic?: number | null;
  runtime_minutes?: number | null;
  director?: string | null;
  last_synced?: string | null;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbMovie {
  id: number;
  title: string;
  original_title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  popularity?: number;
}

export interface TmdbMovieDetails extends TmdbMovie {
  imdb_id?: string | null;
  runtime?: number | null;
  genres?: TmdbGenre[];
  credits?: {
    crew?: Array<{ job: string; name: string }>;
    cast?: Array<{ name: string }>;
  };
}

export interface DiscoverParams {
  primary_release_year?: number;
  with_genres?: string;
  vote_average_gte?: number;
  vote_count_gte?: number;
  sort_by?: string;
  page?: number;
}

export interface OmdbRatings {
  imdb_rating?: number | null;
  imdb_votes?: number | null;
  rt_score?: number | null;
  metacritic?: number | null;
}

export interface OmdbResponse {
  Title?: string;
  Year?: string;
  imdbID?: string;
  imdbRating?: string;
  imdbVotes?: string;
  Ratings?: Array<{ Source: string; Value: string }>;
  Response?: string;
  Error?: string;
}
