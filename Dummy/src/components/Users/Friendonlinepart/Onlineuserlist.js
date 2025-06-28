import React, { useState, useEffect } from "react";
import messageimg from "@images/messagefriendsection.svg";
import settings from "@images/3dots.svg";
import Search from "../../images/search.svg";
import solo from "@images/solo.jfif";
import styled from "styled-components";
import axios from "axios";
import { Link } from "react-router-dom";
import Profilephoto from "@/components/userprofile/profilephoto";
import { useSelector } from "react-redux";
import { ScrollArea } from "@ui/scroll-area";
import { getSocket } from "@/socket"; // Import the getSocket function

const Onlineuserlist = () => {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("pending");
  const { SearchFilterForUseronline } = useSelector(
    (state) => state.counterSlice
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get("/api/users/users/getusers");
        setUsers(response.data);
        console.log(response.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    setFilter(SearchFilterForUseronline);
  }, [SearchFilterForUseronline]);

  useEffect(() => {
    const socket = getSocket(); // Get the socket instance

    socket.on("user-status-changed", ({ userId, connected }) => {
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user._id === userId ? { ...user, connected } : user
        )
      );
    });

    return () => {
      socket.off("user-status-changed");
    };
  }, []);

  const filteredUsers = users.filter((user) =>
    filter === "online"
      ? user.connected &&
        user.username.toLowerCase().includes(query.toLowerCase())
      : user.username.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <Cover>
      <div>
        <Searchbar>
          <input
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Search"
          />
          <img src={Search} alt="" />
        </Searchbar>
      </div>

      <Textonline>
        <p>{filter === "online" ? "Online" : "All Users"}</p>
        <p>-</p>
        <p>{filteredUsers.length}</p>
      </Textonline>
      <ScrollArea className="w-full h-full">
        <Onlineuserswrapper>
          {filteredUsers.map((user) => (
            <React.Fragment key={user._id}>
              <div className="Seperator"></div>
              <Link
                to={`/@me/${user._id}`}
                key={user._id}
                style={{ textDecoration: "none" }}
              >
                <Container key={user._id}>
                  <div className="Firstdivwrapper">
                    <div className="w-8 h-8">
                      <Profilephoto />
                    </div>
                    <div className="Statusdiv">
                      <p className="name">{user.username}</p>
                      <p className="status">
                        {user.connected ? "Online" : "Offline"}
                      </p>
                    </div>
                  </div>
                  <div className="Seconddivwrapper">
                    <div className="Message">
                      <img src={messageimg} alt="" />
                    </div>
                    <div className="settings">
                      <img src={settings} alt="" />
                    </div>
                  </div>
                </Container>
              </Link>
            </React.Fragment>
          ))}
        </Onlineuserswrapper>
      </ScrollArea>
    </Cover>
  );
};

export default Onlineuserlist;

const Cover = styled.div`
  width: 65vw;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding: 0.5rem;
  padding-left: 1.5rem;
  gap: 1rem;
  .Seperator {
    width: 95%;
    height: 0.5px;
    background-color: #b8b8b81e;
    @media (max-width: 1024px) {
      width: 100%;
      height: 0.5px;
      background-color: #b8b8b81e;
    }
  }
  @media (max-width: 1024px) {
    min-width: 100vw;
    padding: 0.5rem;
    padding-left: 0rem;
    padding-inline: 1rem;

    gap: 1rem;
  }
`;

const Searchbar = styled.div`
  width: 60vw;
  background-color: #1e1f22;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  border-radius: 0.25rem;
  margin-top: 1rem;
  @media (max-width: 1024px) {
    min-width: 93vw;
  }
  input {
    width: 100%;
    height: 2rem;
    padding: 0.4rem;
    outline: none;
    border: none;
    background-color: transparent;
    border-radius: 0.2rem;
    color: white;
  }
  img {
    pointer-events: none;
    position: absolute;
    right: 0.5rem;
    width: 1.5rem;
  }
`;

const FilterButtons = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
  button {
    padding: 0.5rem 1rem;
    background-color: #313338;
    color: white;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    &:hover {
      background-color: #41444b;
    }
    &:focus {
      outline: none;
      background-color: #52575d;
    }
  }
`;

const Textonline = styled.div`
  display: flex;
  gap: 0.2rem;
  padding: 0.2rem;
  margin-top: 0.5rem;
  p {
    font-size: 0.8rem;
    text-transform: uppercase;
    font-family: "Cabin", sans-serif;
    font-weight: bold;
    color: #9b9b9b;
  }
`;

const Onlineuserswrapper = styled.div`
  display: flex;
  height: 100%;
  max-height: 66vh;
  flex-direction: column;
  overflow-y: auto;
  gap: 0.5;
  @media (max-width: 1024px) {
    min-width: 93vw;
  }
`;

const Container = styled.div`
  width: 95%;
  height: 3.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.2rem;
  border-radius: 0.5rem;
  @media (max-width: 1024px) {
    width: 100%;
  }
  p {
    margin: 0;
    color: #ffffffa0;
    letter-spacing: 0.5px;
  }
  .name {
    color: white;
    letter-spacing: 0.5px;
  }
  .Firstdivwrapper {
    display: flex;
    gap: 0.5rem;
    align-items: center;

    .image {
      width: 2.2rem;
      height: 2.2rem;
      display: flex;
      align-items: center;
      margin-left: 0.5rem;
      border-radius: 100%;
      img {
        width: 100%;
        object-fit: cover;
        height: 100%;
        border-radius: 100%;
        border: 1px solid #4c4f55;
      }
    }
    .Statusdiv {
      display: flex;
      flex-direction: column;
      .name {
        font-size: 1rem;
        font-weight: bold;
      }
      .status {
        font-size: 0.8rem;
      }
    }
  }
  .Seconddivwrapper {
    display: flex;
    gap: 0.5rem;
    padding-right: 0.5rem;
    .Message {
      width: 2.2rem;
      height: 2.2rem;
      background-color: #2b2d31;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 100%;
      img {
        width: 1.2rem;
      }
    }
    .settings {
      background-color: #2b2d31;
      justify-content: center;

      width: 2.2rem;
      height: 2.2rem;
      display: flex;
      align-items: center;
      border-radius: 100%;

      img {
        width: 1.2rem;
      }
    }
  }
`;
