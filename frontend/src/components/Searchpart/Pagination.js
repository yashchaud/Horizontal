import React from "react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@ui/pagination";

const PaginationComponent = ({
  totalMessages,
  messagesPerPage,
  currentPage,
  setCurrentPage,
}) => {
  const totalPages = Math.ceil(totalMessages / messagesPerPage);

  const handleClick = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  const renderPaginationItems = () => {
    const paginationItems = [];

    paginationItems.push(
      <PaginationItem key={1}>
        <PaginationLink
          href="#"
          onClick={() => handleClick(1)}
          className={1 === currentPage ? "active" : ""}
        >
          1
        </PaginationLink>
      </PaginationItem>
    );

    if (totalPages > 1) {
      let middlePage = currentPage;
      if (middlePage === 1) {
        middlePage += 1;
      } else if (middlePage === totalPages) {
        middlePage -= 1;
      }

      paginationItems.push(
        <PaginationItem key={middlePage}>
          <PaginationLink
            href="#"
            onClick={() => handleClick(middlePage)}
            className={middlePage === currentPage ? "active" : ""}
          >
            {middlePage}
          </PaginationLink>
        </PaginationItem>
      );

      if (middlePage < totalPages - 1) {
        paginationItems.push(<PaginationEllipsis key="ellipsis" />);
      }

      paginationItems.push(
        <PaginationItem key={totalPages}>
          <PaginationLink
            href="#"
            onClick={() => handleClick(totalPages)}
            className={totalPages === currentPage ? "active" : ""}
          >
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }

    return paginationItems;
  };

  return (
    <div>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              onClick={() => handleClick(currentPage - 1)}
              disabled={currentPage === 1}
            />
          </PaginationItem>
          {renderPaginationItems()}
          <PaginationItem>
            <PaginationNext
              href="#"
              onClick={() => handleClick(currentPage + 1)}
              disabled={currentPage === totalPages}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
};

export default PaginationComponent;
