export const getPagination = (query = {}) => {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 25;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

export const getPaginationMetadata = ({ page, limit, total }) => ({
  page,
  limit,
  total,
  pages: total === 0 ? 0 : Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPreviousPage: page > 1,
});

export const setPaginationHeaders = (res, metadata) => {
  res.setHeader('X-Pagination-Page', String(metadata.page));
  res.setHeader('X-Pagination-Limit', String(metadata.limit));
  res.setHeader('X-Pagination-Total', String(metadata.total));
  res.setHeader('X-Pagination-Pages', String(metadata.pages));
};
