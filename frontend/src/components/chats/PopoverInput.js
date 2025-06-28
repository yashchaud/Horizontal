import React, { useState, useRef, useEffect, useReducer } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Popover, PopoverTrigger, PopoverContent } from "@ui/popover";
import { Input } from "@ui/input";
import { PopoverAnchor } from "@radix-ui/react-popover";
import styled from "styled-components";
import search from "../images/search.svg";
import cross from "../images/X.svg";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import {
  setFilters,
  setTextFilter,
  setsearchresult,
} from "@/Redux/sessionSlice"; // Import the action
import { useParams } from "react-router-dom";
import axios from "axios";
import { setToggleSearchBar } from "@/Redux/sessionSlice";
import { QueryClient, useQuery } from "@tanstack/react-query";

const initialState = {
  inputValue: "",
  filters: [],
  selectedFilter: null,
  isPopoverOpen: false,
  searchResults: [],
};

const reducer = (state, action) => {
  switch (action.type) {
    case "SET_INPUT_VALUE":
      return { ...state, inputValue: action.payload, isPopoverOpen: true };
    case "SET_FILTERS":
      return { ...state, filters: action.payload };
    case "SET_SELECTED_FILTER":
      return { ...state, selectedFilter: action.payload };
    case "SET_POPOVER_OPEN":
      return { ...state, isPopoverOpen: action.payload };
    case "SET_SEARCH_RESULTS":
      return { ...state, searchResults: action.payload };
    default:
      return state;
  }
};

const PopoverInput = ({ users }) => {
  const container = useRef();
  const { id, channelId, threadId } = useParams();
  const [state, dispatchLocal] = useReducer(reducer, initialState);
  const inputRef = useRef(null);
  const popoverRef = useRef(null);
  const anchorRef = useRef(null);
  const dispatch = useDispatch();
  const [channels, setServerChannels] = useState([]);
  const reduxFilters = useSelector((state) => state?.filters?.filters);
  useEffect(() => {
    dispatch(setsearchresult([]));
    dispatchLocal({ type: "SET_FILTERS", payload: [] });
    dispatchLocal({ type: "SET_SELECTED_FILTER", payload: null });
    dispatch(setFilters([])); // Update Redux state
  }, [channelId]);

  useEffect(() => {
    if (state.filters.length > 0 && state.inputValue) {
      const criteria = getSearchCriteria(state.filters);
      fetchSearchResults(criteria);
    }
  }, [state.inputValue, state.filters]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target)
      ) {
        dispatchLocal({ type: "SET_POPOVER_OPEN", payload: false });
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [popoverRef, anchorRef]);

  const handleInputChange = (e) => {
    dispatch(setTextFilter(e.target.value));
    dispatchLocal({ type: "SET_INPUT_VALUE", payload: e.target.value });
  };

  const handleFilterClick = (filter) => {
    if (!state.selectedFilter) {
      const newFilters = [...state.filters, { type: filter }];
      dispatchLocal({ type: "SET_FILTERS", payload: newFilters });
      dispatchLocal({ type: "SET_SELECTED_FILTER", payload: filter });
      dispatch(setFilters(newFilters)); // Update Redux state
    }
    inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (
      e.key === "Backspace" &&
      state.inputValue === "" &&
      state.filters.length > 0
    ) {
      dispatchLocal({ type: "SET_FILTERS", payload: [] });
      dispatchLocal({ type: "SET_SELECTED_FILTER", payload: null });
      dispatch(setFilters([])); // Update Redux state
    }
    dispatchLocal({ type: "SET_POPOVER_OPEN", payload: true });
  };

  const handleOptionClick = (option) => {
    const updatedFilters = state.filters.map((filter) =>
      filter.type === state.selectedFilter
        ? { ...filter, value: option }
        : filter
    );
    dispatchLocal({ type: "SET_FILTERS", payload: updatedFilters });
    dispatchLocal({ type: "SET_INPUT_VALUE", payload: "" });
    dispatchLocal({ type: "SET_SELECTED_FILTER", payload: null });
    dispatchLocal({ type: "SET_POPOVER_OPEN", payload: false });
    dispatch(setFilters(updatedFilters)); // Update Redux state
    inputRef.current.focus();
  };

  const fetchSearchResults = async (criteria) => {
    try {
      const response = await axios.get("/api/chats/search/search", {
        params: {
          text: state.inputValue,
          sender: criteria.sender,
          channel: criteria.channel || channelId, // Ensure channel is passed
        },
      });
      dispatchLocal({ type: "SET_SEARCH_RESULTS", payload: response.data });
      dispatch(setsearchresult(response.data));
    } catch (error) {
      console.error("Error fetching search results:", error);
    }
  };
  useEffect(() => {
    const getServerfromId = async () => {
      const response = await axios
        .get(`/api/server/servers/${channelId}`, {
          params: {
            id: channelId,
          },
        })
        .then((response) => {
          setServerChannels(response.data.channels);
        });
    };
    getServerfromId();
  }, []);

  useEffect(() => {
    const sender = state;
    const criteria = {
      sender: state?.filters[0]?.value?._id,
      channel: channelId,
    };

    fetchSearchResults(criteria);
  }, [state.filters, channelId, state.inputValue]); // Add channelId as a dependency

  useEffect(() => {
    const sender = state?.filters[0]?.value?._id;

    if (sender !== null || sender !== undefined) {
      dispatch(setToggleSearchBar(true));
    }
    if (state.filters.length === 0 && state.inputValue === "") {
      dispatch(setToggleSearchBar(false));
    }
  }, [state.filters, channelId, state.inputValue]); // Add channelId as a dependency

  const filteredOptions =
    state.selectedFilter === "from:user"
      ? users.filter(
          (user) =>
            !state.filters.some((filter) => filter.value?.id === user._id) &&
            user.username.toLowerCase().includes(state.inputValue.toLowerCase())
        )
      : channels.filter(
          (channel) =>
            !state.filters.some((filter) => filter.value?.id === channel.id) &&
            channel.name.toLowerCase().includes(state.inputValue.toLowerCase())
        );

  const getSearchCriteria = (filters) => {
    const criteria = {};
    filters.forEach((filter) => {
      if (filter.type === "from:user") {
        criteria.sender = filter.value._id;
      } else if (filter.type === "from:channel") {
        criteria.channel = filter.value.id;
      }
    });
    return criteria;
  };

  const { data } = useQuery({
    queryKey: ["Channels", state.inputValue, state.filters],
    queryFn: async () => {
      const response = await axios.get(`/api/channel/${id}`);
      console.log("Channel in popover", response.data);
      return response.data;
    },
    onSucess: (data) => {
      dispatch(setServerChannels(data.channels));
    },
  });
  const truncateText = (text, maxLength) => {
    if (text.length > maxLength) {
      return `${text.substring(0, maxLength)}...`;
    }

    return text;
  };

  useGSAP(
    () => {
      gsap.fromTo(
        popoverRef.current,
        { translateY: -110 },
        { translateY: 0, ease: "Power2.out", duration: 1 }
      );
    },
    { scope: popoverRef, dependencies: [] }
  );

  return (
    <div>
      <Popover
        open={state.isPopoverOpen}
        onClose={() =>
          dispatchLocal({ type: "SET_POPOVER_OPEN", payload: false })
        }
      >
        <PopoverAnchor asChild ref={anchorRef}>
          <StyledInputWrapper>
            <StyledFilters>
              {state.filters.map((filter, index) => (
                <Filter key={index}>
                  {filter.type.replace("from:", "")}:{" "}
                  {filter?.value ? truncateText(filter?.value.username, 5) : ""}
                </Filter>
              ))}
            </StyledFilters>

            <StyledInput
              ref={inputRef}
              value={state.inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onFocus={() =>
                dispatchLocal({ type: "SET_POPOVER_OPEN", payload: true })
              }
              className="max-h-[1px] w-full bg-[#1e1f22] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1]"
              placeholder="Search"
            />
            {state.filters.length > 0 ? (
              <img
                onClick={() => {
                  dispatchLocal({ type: "SET_FILTERS", payload: [] });
                  dispatchLocal({ type: "SET_SELECTED_FILTER", payload: null });
                  dispatch(setsearchresult([]));
                }}
                className="min-w-6 w-6 h-6 cursor-pointer"
                src={cross}
                alt=""
              />
            ) : (
              <img className="w-5 h-5" src={search} alt="" />
            )}
          </StyledInputWrapper>
        </PopoverAnchor>
        <PopoverContent
          ref={popoverRef}
          className="relative left-14 w-[300px] bg-[#131314] text-white outline-none border-none placeholder:text-muted-foreground placeholder:text-[#b5bac1] z-[21333333332123] p-2"
        >
          <>
            <div>
              {!state.selectedFilter &&
              !state.inputValue &&
              state.filters.length === 0 ? (
                <div className="flex flex-col gap-1 text-[#131314]">
                  <div>
                    <div className="flex flex-col justify-start items-start gap-1 text-[#b5bac1]">
                      <div className="flex justify-between items-center pr-2 pl-2">
                        <p className="text-sm text-[#b5bac1] font-bold mt-2">
                          SEARCH OPTIONS
                        </p>
                      </div>
                      {!state.selectedFilter && (
                        <>
                          <div
                            className="p-2 flex items-center text-sm min-h-6 w-[100%] hover:bg-[#1b1c1d] hover:text-white cursor-pointer rounded-md hover:font-bold"
                            onClick={() => handleFilterClick("from:user")}
                          >
                            <p className="font-bold text-md text-[#bcc2ca]">
                              from: <span className="text-[#b5bac1]">user</span>
                            </p>
                          </div>
                          <div
                            className="p-2 flex items-center text-sm min-h-6 w-[100%] hover:bg-[#1b1c1d] hover:text-white cursor-pointer rounded-sm"
                            onClick={() => handleFilterClick("from:channel")}
                          >
                            <p className="font-bold text-md text-[#bcc2ca]">
                              from:{" "}
                              <span className="text-[#b5bac1]">channel</span>
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <OptionsList className="flex flex-col gap-2">
                  {state.filters.length !== 0 &&
                    state.selectedFilter !== null &&
                    filteredOptions.map((option) => (
                      <Option
                        className="flex items-center gap-2 cursor-pointer hover:bg-[#131314] hover:text-white rounded-sm"
                        key={option._id || option.id}
                        onClick={() => {
                          handleOptionClick(option);
                        }}
                      >
                        {option.username || option.name}
                      </Option>
                    ))}
                </OptionsList>
              )}
              {state.inputValue && (
                <SearchResults>
                  {state.searchResults.map((result) => (
                    <Option key={result.id}>{result.message}</Option>
                  ))}
                </SearchResults>
              )}
            </div>
          </>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default PopoverInput;

const StyledInputWrapper = styled.div`
  display: flex;
  align-items: center;
  background: #1e1f22;
  padding: 3px;
  border-radius: 5px;
  gap: 5px;
`;

const StyledFilters = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
`;

const StyledInput = styled(Input)`
  outline: none !important;
  box-shadow: none !important;
  &:focus {
    outline: none !important;
    box-shadow: none !important;
  }
  color: white !important;
  flex: 1;
  background: #1e1f22 !important;
  transition: width 0.3s ease-in-out;

  &:focus {
    width: 11rem;
  }
`;

const Filter = styled.div`
  background: #212224;
  color: white;
  padding: 2px 6px;
  border-radius: 2px;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.875rem;
  max-width: 100px;

  white-space: nowrap;

  overflow: hidden;

  text-overflow: ellipsis;
`;

const OptionsList = styled.div`
  background: #131314;
  padding: 10px;
  margin-top: 10px;
`;

const Option = styled.div`
  padding: 5px 10px;
  background-color: #131314;
  cursor: pointer;
  &:hover {
    background: #2e2e2ed5;
    color: white;
  }
`;

const SearchResults = styled.div`
  margin-top: 10px;
  background: #1e1f22;
  color: white;
  padding: 10px;
`;
